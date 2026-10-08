import type { AutomationHostCatalogView } from './use-automation-host-catalog'

export type AutomationListRefreshOutcome = {
  page: 'completed' | 'failed'
  hosts: 'settled' | 'failed'
}

export function createAutomationListRefreshAction(
  hosts: Pick<AutomationHostCatalogView, 'refreshHosts'>,
  page: { refresh: () => Promise<boolean> }
): () => Promise<AutomationListRefreshOutcome> {
  return async () => {
    const [hostResult, pageResult] = await Promise.allSettled([
      hosts.refreshHosts(),
      page.refresh()
    ])
    return {
      page: pageResult.status === 'fulfilled' && pageResult.value ? 'completed' : 'failed',
      // The scheduler records individual failures in catalog health instead of rejecting.
      hosts: hostResult.status === 'fulfilled' ? 'settled' : 'failed'
    }
  }
}
