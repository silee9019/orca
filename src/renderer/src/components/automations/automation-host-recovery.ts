/**
 * Turns a recovery verb into the one action that can actually fix it.
 *
 * The verbs come from `automation-host-status-descriptors.ts` and are never
 * invented here; this module only decides *what* Retry, Reconnect, and Update
 * server mean for a given host. Reconnect dials the thing that is down — the
 * runtime transport or the SSH target — and Update server can only take the user
 * to where the version is managed, because nothing in the app updates a host.
 */

import type { SettingsNavigationTarget } from '@/lib/settings-navigation-types'
import type { AutomationHostCatalogEntry } from './automation-host-catalog-types'
import type { AutomationHostRecoveryAction } from './automation-host-status-descriptors'

export type AutomationHostRecoveryDeps = {
  /** Forces one fresh query for this host, bypassing TTL and retry cooldown. */
  retry: (entry: AutomationHostCatalogEntry) => void | Promise<unknown>
  connectSshTarget: (targetId: string) => void | Promise<unknown>
  connectRuntimeEnvironment: (environmentId: string) => void | Promise<unknown>
  openSettings: (target: SettingsNavigationTarget) => void
}

/** The Remote Orca Servers pane owns each runtime's version status and update action. */
export function versionSettingsTarget(entry: AutomationHostCatalogEntry): SettingsNavigationTarget {
  if (entry.stableRef.authority.kind === 'runtime') {
    return {
      pane: 'servers',
      repoId: null,
      sectionId: entry.stableRef.authority.environmentId
    }
  }
  // A desktop SSH host with no registration generation is a stale registration,
  // repaired by re-adding the target rather than by updating anything.
  return { pane: entry.stableRef.selector.kind === 'ssh' ? 'ssh' : 'automations', repoId: null }
}

function reconnect(
  entry: AutomationHostCatalogEntry,
  deps: AutomationHostRecoveryDeps
): void | Promise<unknown> {
  const authority = entry.stableRef.authority
  // Authority first: an unreachable server cannot be asked to dial its own targets.
  if (authority.kind === 'runtime' && entry.authorityHealth === 'unavailable') {
    return deps.connectRuntimeEnvironment(authority.environmentId)
  }
  if (entry.stableRef.selector.kind === 'ssh') {
    return deps.connectSshTarget(entry.stableRef.selector.targetId)
  }
  if (authority.kind === 'runtime') {
    return deps.connectRuntimeEnvironment(authority.environmentId)
  }
  // Desktop Self has no transport to dial, so the only honest fallback is to re-ask.
  return deps.retry(entry)
}

export function runAutomationHostRecovery(
  action: AutomationHostRecoveryAction,
  entry: AutomationHostCatalogEntry | null,
  deps: AutomationHostRecoveryDeps
): void | Promise<unknown> {
  if (!entry) {
    return
  }
  switch (action) {
    case 'retry':
      return deps.retry(entry)
    case 'reconnect':
      return reconnect(entry, deps)
    case 'update-server':
      deps.openSettings(versionSettingsTarget(entry))
  }
}
