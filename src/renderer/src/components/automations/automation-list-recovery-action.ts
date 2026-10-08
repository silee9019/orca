import type { AutomationHostCatalogView } from './use-automation-host-catalog'
import type { AutomationHostCatalogEntry } from './automation-host-catalog-types'
import type { AutomationHostRecoveryAction } from './automation-host-status-descriptors'
import type { SettingsNavigationTarget } from '@/lib/settings-navigation-types'

export type AutomationListRecoveryOutcome = {
  action: AutomationHostRecoveryAction
  operation: 'settled' | 'failed' | 'navigation-requested'
  page: 'completed' | 'failed' | 'skipped'
  navigationTarget?: SettingsNavigationTarget
}

export function createAutomationListRecoveryAction(
  hosts: Pick<AutomationHostCatalogView, 'recover'>,
  page: { refresh: () => Promise<boolean> }
) {
  return async (
    action: AutomationHostRecoveryAction,
    entry?: AutomationHostCatalogEntry | null
  ): Promise<AutomationListRecoveryOutcome> => {
    const [recovery, refreshed] = await Promise.allSettled([
      hosts.recover(action, entry),
      action === 'retry' ? page.refresh() : Promise.resolve(null)
    ])
    return {
      action,
      operation: recovery.status === 'fulfilled' ? recovery.value : 'failed',
      page:
        action !== 'retry'
          ? 'skipped'
          : refreshed.status === 'fulfilled' && refreshed.value
            ? 'completed'
            : 'failed'
    }
  }
}
