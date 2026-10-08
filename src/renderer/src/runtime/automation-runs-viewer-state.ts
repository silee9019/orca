import type { Dispatch, SetStateAction } from 'react'
import type {
  AutomationRunsDashboardEntry,
  AutomationRunsStatusFilter
} from '../components/automations/automation-runs-dashboard-model'

export type AutomationRunsViewerQuery = { ownerKey: string; settledRevision: number }
export type AutomationRunsViewerForm = {
  request?: AutomationRunsViewerQuery
  onOpenRun: (entry: AutomationRunsDashboardEntry) => void
  onRefresh: () => void
  onLoadMore: () => void
  query: string
  deferredQuery: string
  status: AutomationRunsStatusFilter
  hostKeys: string[]
  hostOptions: { key: string; label: string }[]
  visibleEntries: readonly AutomationRunsDashboardEntry[]
  visibleFailureCount: number
  loading: boolean
  hasMore: boolean
  setQuery: Dispatch<SetStateAction<string>>
  setStatus: Dispatch<SetStateAction<AutomationRunsStatusFilter>>
  setHostKeys: Dispatch<SetStateAction<string[]>>
  toggleHost: (key: string) => void
}

export function automationRunsReviewScope(form: AutomationRunsViewerForm): string {
  return JSON.stringify([
    form.request,
    form.query,
    form.status,
    form.hostKeys,
    form.hostOptions.map((host) => host.key),
    form.visibleEntries.map((entry) => [entry.key, entry.run]),
    form.loading,
    form.hasMore
  ])
}

export function automationRunsFormSnapshot(
  form: AutomationRunsViewerForm,
  busy: boolean,
  reviewedTarget: string,
  lastOperation: 'refresh' | 'load-more' | null
) {
  return {
    committed: true as const,
    reviewedTarget,
    outcome: lastOperation ? { action: lastOperation, operation: 'settled' as const } : null,
    query: form.query,
    querySettled: form.query === form.deferredQuery,
    status: form.status,
    hostKeys: form.hostKeys,
    hosts: form.hostOptions,
    entries: form.visibleEntries.map((entry) => ({
      key: entry.key,
      hostKey: entry.hostKey,
      rowKey: entry.row.key,
      definitionId: entry.row.automation.id,
      run: entry.run
    })),
    visibleFailureCount: form.visibleFailureCount,
    loading: form.loading,
    hasMore: form.hasMore,
    busy
  }
}
export type AutomationRunsViewerState = ReturnType<typeof automationRunsFormSnapshot>
