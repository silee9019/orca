import type { z } from 'zod'
import type { Store } from '../persistence'
import type { PluginService } from './plugin-service'
import { PluginPreferencesUpdate } from '../../shared/rpc-contract/plugins-management-params'
import type { PluginInstallParams } from '../../shared/rpc-contract/plugins-management-params'
import { normalizePluginIdList } from '../../shared/plugins/plugin-consent-state'
import type { PluginLockfile } from '../../shared/plugins/plugin-install-lockfile'
import { getPluginsDataDir, getUserPluginsDir } from './plugin-discovery'
import {
  installPluginFromGit,
  installPluginFromLocalPath,
  readPluginLockfile,
  removeInstalledPlugin
} from './plugin-install'
import { listPluginsForClients } from './plugin-client-list'

export function canRemoveInstalledPlugin(
  service: PluginService,
  pluginKey: string,
  lock?: PluginLockfile
): boolean {
  return (
    lock?.plugins[pluginKey]?.source.kind !== 'bundled' &&
    service.getDiscovered().some((plugin) => plugin.pluginKey === pluginKey && !plugin.isDev)
  )
}

export async function installManagedPlugin(
  service: PluginService,
  input: z.infer<typeof PluginInstallParams>
) {
  await service.whenReady()
  const options = {
    pluginsDir: getUserPluginsDir(service.options.userDataPath),
    hostVersion: service.options.hostVersion,
    blockedPluginReason: (key: string) =>
      service.options.getPluginKillListEntry?.(key)?.reason ?? null
  }
  const result =
    input.kind === 'local-path'
      ? await installPluginFromLocalPath({ ...options, sourcePath: input.path })
      : await installPluginFromGit({ ...options, url: input.url, ref: input.ref })
  if (result.ok) {
    await service.refresh()
  }
  return result
}

export async function removeManagedPlugin(
  store: Store,
  service: PluginService,
  pluginKey: string,
  originWebContentsId?: number
) {
  await service.whenReady()
  const pluginsDir = getUserPluginsDir(service.options.userDataPath)
  const lock = await readPluginLockfile(pluginsDir)
  if (!canRemoveInstalledPlugin(service, pluginKey, lock)) {
    throw new Error(`cannot remove protected or non-installed plugin ${pluginKey}`)
  }
  await service.removePlugin(pluginKey, () =>
    removeInstalledPlugin({
      pluginsDir,
      pluginsDataDir: getPluginsDataDir(service.options.userDataPath),
      pluginKey
    })
  )
  const settings = store.getSettings()
  const consents = { ...settings.pluginConsents }
  delete consents[pluginKey]
  store.updateSettings(
    {
      pluginConsents: consents,
      disabledPlugins: normalizePluginIdList(settings.disabledPlugins).filter(
        (key) => key !== pluginKey
      )
    },
    { notifyListeners: true, originWebContentsId }
  )
  await service.refresh()
  return listPluginsForClients(service)
}

export function projectPluginPreferences(settings: {
  pluginSystemEnabled?: boolean
  devPluginPaths?: unknown
}) {
  return {
    pluginSystemEnabled: settings.pluginSystemEnabled === true,
    devPluginPaths: normalizePluginIdList(settings.devPluginPaths)
  }
}

export async function updateManagedPluginPreferences(
  store: {
    getSettings: () => { pluginSystemEnabled?: boolean; devPluginPaths?: unknown }
    updateSettings: (
      updates: z.infer<typeof PluginPreferencesUpdate>,
      options: { notifyListeners: true }
    ) => unknown
    flushPendingOrThrowAsync: () => Promise<void>
  },
  service: Pick<PluginService, 'refresh'>,
  input: unknown
) {
  const updates = PluginPreferencesUpdate.parse(input)
  store.updateSettings(updates, { notifyListeners: true })
  await store.flushPendingOrThrowAsync()
  await service.refresh()
  return {
    preferences: projectPluginPreferences(store.getSettings()),
    persisted: true,
    applied: true,
    rendered: false
  }
}
