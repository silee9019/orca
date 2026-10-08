import { PLUGIN_CAPABILITY_DESCRIPTIONS } from '../../shared/plugins/plugin-capabilities'
import { needsReconsent } from '../../shared/plugins/plugin-consent-state'
import { pluginPanelTabKey } from '../../shared/plugins/plugin-manifest'
import type { PluginLockfile } from '../../shared/plugins/plugin-install-lockfile'
import { isInvalidDiscoveredPlugin } from './plugin-discovery'
import type { PluginService } from './plugin-service'
import { listPluginVmRecipeCommands } from '../../shared/plugins/plugin-vm-recipe-artifact'
import {
  isOfficialMarketplaceGitSource,
  isOfficialOrganizationGitSource,
  isOfficialPluginIdentity
} from '../../shared/plugins/plugin-marketplace'
import { mapWithConcurrency } from '../../shared/map-with-concurrency'

const PLUGIN_LIST_PROJECTION_CONCURRENCY = 4

/**
 * Wire projection of installed plugins for the renderer and serve RPC.
 * `invalid` = unreadable/failed manifest; `pending` = awaiting (re-)consent;
 * `idle` = enabled with no worker running (lazy); `restarting` = waiting for
 * supervised backoff; `errored` = crashed past the budget or failed to activate.
 */

export type { PluginListEntry } from '../../shared/plugins/plugin-list-contract'
import type { PluginListEntry, PluginListStatus } from '../../shared/plugins/plugin-list-contract'

export async function buildPluginList(
  service: PluginService,
  lock: PluginLockfile
): Promise<PluginListEntry[]> {
  const consents = {
    pluginConsents: service.options.getPluginConsents(),
    disabledPlugins: service.options.getDisabledPlugins()
  }
  return mapWithConcurrency(
    service.getDiscovered(),
    PLUGIN_LIST_PROJECTION_CONCURRENCY,
    async (plugin, index): Promise<PluginListEntry> => {
      if (isInvalidDiscoveredPlugin(plugin)) {
        // Why: invalid dev paths can contain private absolute desktop paths;
        // never project those as identity over desktop/serve transports.
        const fallbackKey = plugin.pluginKey ?? `invalid-development-plugin-${index + 1}`
        return {
          pluginKey: fallbackKey,
          consentFingerprint: null,
          name: fallbackKey,
          version: '0.0.0',
          publisher: '',
          status: 'invalid' as const,
          needsReconsent: false,
          error: plugin.error,
          isDev: plugin.isDev,
          official: false,
          bundled: false,
          capabilities: [],
          panels: [],
          commands: [],
          hasWorker: false,
          vmRecipes: [],
          restarts: 0
        }
      }
      const activation = service.activationState(plugin)
      const worker = service.workerState(plugin.pluginKey)
      const activationError = service.activationError(plugin.pluginKey)
      const killListEntry = service.options.getPluginKillListEntry?.(plugin.pluginKey) ?? null
      let status: PluginListStatus
      if (activation === 'disabled') {
        status = 'disabled'
      } else if (activation === 'pending') {
        status = 'pending'
      } else if (worker.state === 'errored' || activationError) {
        status = 'errored'
      } else if (worker.state === 'restarting') {
        status = 'restarting'
      } else {
        status = worker.state === 'running' ? 'running' : 'idle'
      }
      const candidateLockEntry = lock.plugins[plugin.pluginKey]
      // Why: never show provenance for bytes other than the current executable
      // identity. Dev overrides execute outside the immutable installed tree and
      // must never inherit the shadowed install's pinned-source attribution.
      const lockEntry =
        candidateLockEntry &&
        !plugin.isDev &&
        plugin.contentHash !== null &&
        candidateLockEntry.contentHash === plugin.contentHash
          ? candidateLockEntry
          : undefined
      const bundled = lockEntry?.source.kind === 'bundled'
      const official =
        bundled ||
        (lockEntry?.source.kind === 'marketplace' &&
          isOfficialPluginIdentity(plugin.pluginKey) &&
          isOfficialMarketplaceGitSource(lockEntry.source.marketplace.url) &&
          isOfficialOrganizationGitSource(lockEntry.source.plugin.url))
      return {
        pluginKey: plugin.pluginKey,
        commandInputVersion: 1,
        consentFingerprint: plugin.consentFingerprint,
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        publisher: plugin.manifest.publisher,
        ...(plugin.manifest.description ? { description: plugin.manifest.description } : {}),
        status,
        needsReconsent: needsReconsent(plugin.pluginKey, plugin.consentFingerprint, consents),
        ...(status === 'errored'
          ? { error: activationError ?? 'plugin worker crashed repeatedly' }
          : {}),
        isDev: plugin.isDev,
        official,
        bundled,
        capabilities: plugin.manifest.capabilities.map((capability) => ({
          kind: capability.kind,
          description: PLUGIN_CAPABILITY_DESCRIPTIONS[capability.kind]
        })),
        panels: plugin.manifest.contributes.panels.map((panel) => ({
          id: panel.id,
          title: panel.title,
          ...(panel.icon ? { icon: panel.icon } : {}),
          tabKey: pluginPanelTabKey(plugin.pluginKey, panel.id)
        })),
        commands: service.contentPacks.commands.preview(plugin.pluginKey).map((command) => ({
          id: command.id,
          title: command.title,
          context: command.context,
          handler: command.handler,
          keybindings: command.keybindings,
          input: plugin.manifest.contributes.commands.find((entry) => entry.id === command.id)
            ?.input
        })),
        hasWorker: Boolean(plugin.manifest.main),
        vmRecipes: service.contentPacks.vmRecipes.preview(plugin.pluginKey).map(({ recipe }) => ({
          id: recipe.id,
          name: recipe.name,
          ...(recipe.description ? { description: recipe.description } : {}),
          commands: listPluginVmRecipeCommands(recipe)
        })),
        restarts: worker.restarts,
        ...(killListEntry
          ? {
              blockedByKillList: {
                reason: killListEntry.reason,
                ...(killListEntry.advisoryUrl ? { advisoryUrl: killListEntry.advisoryUrl } : {})
              }
            }
          : {}),
        ...(lockEntry
          ? {
              source: {
                kind: lockEntry.source.kind,
                reference:
                  lockEntry.source.kind === 'local-path'
                    ? lockEntry.source.path
                    : lockEntry.source.kind === 'git'
                      ? lockEntry.source.url
                      : lockEntry.source.kind === 'marketplace'
                        ? lockEntry.source.plugin.url
                        : `bundled:${lockEntry.source.bundleId}`,
                resolvedCommit: lockEntry.resolvedCommit,
                contentHash: lockEntry.contentHash,
                ...(lockEntry.source.kind === 'marketplace'
                  ? {
                      marketplace: {
                        reference: lockEntry.source.marketplace.url,
                        resolvedCommit: lockEntry.source.marketplace.resolvedCommit
                      }
                    }
                  : {})
              }
            }
          : {})
      }
    }
  )
}
