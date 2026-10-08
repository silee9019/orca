import { useDeferredValue, useMemo, useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { AutomationListRow } from './automation-list-row-identity'
import {
  countAutomationRunOutcomes,
  filterAutomationRunsDashboardEntries,
  getAutomationRunsHostKey,
  getAutomationRunsScope,
  type AutomationRunsDashboardEntry,
  type AutomationRunsDashboardFailure,
  type AutomationRunsStatusFilter
} from './automation-runs-dashboard-model'
import { useAutomationRunsViewerController } from '../../runtime/automation-runs-viewer-controller'
import type { AutomationRunsViewerQuery } from '../../runtime/automation-runs-viewer-state'

export function useAutomationRunsDashboardFilters({
  rows,
  entries,
  failures,
  now,
  loading,
  hasMore,
  request,
  onOpenRun,
  onRefresh,
  onLoadMore
}: {
  rows: readonly AutomationListRow[]
  entries: readonly AutomationRunsDashboardEntry[]
  failures: readonly AutomationRunsDashboardFailure[]
  now: number
  loading: boolean
  hasMore: boolean
  request?: AutomationRunsViewerQuery
  onOpenRun: (entry: AutomationRunsDashboardEntry) => void
  onRefresh: () => void
  onLoadMore: () => void
}) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [status, setStatus] = useState<AutomationRunsStatusFilter>('all')
  const [hostKeys, setHostKeys] = useState<string[]>([])
  const hostOptions = useMemo(() => {
    const options = new Map<string, string>()
    for (const row of rows) {
      const scope = getAutomationRunsScope(row)
      options.set(
        getAutomationRunsHostKey(row),
        row.hostLabel ||
          translate(
            `auto.components.automations.AutomationRunsDashboard.${scope}`,
            scope === 'local' ? 'Local' : 'Remote'
          )
      )
    }
    return [...options].map(([key, label]) => ({ key, label }))
  }, [rows])
  const hostEntries = useMemo(
    () => filterAutomationRunsDashboardEntries({ entries, status: 'all', query: '', hostKeys }),
    [entries, hostKeys]
  )
  const visibleEntries = useMemo(
    () => filterAutomationRunsDashboardEntries({ entries, status, query: deferredQuery, hostKeys }),
    [deferredQuery, entries, hostKeys, status]
  )
  const counts = useMemo(() => countAutomationRunOutcomes(hostEntries, now), [hostEntries, now])
  const visibleFailures = failures.filter(
    (failure) => hostKeys.length === 0 || hostKeys.includes(getAutomationRunsHostKey(failure.row))
  )
  const activeFilterCount = (status === 'all' ? 0 : 1) + (hostKeys.length > 0 ? 1 : 0)

  const toggleHost = (hostKey: string): void => {
    setHostKeys((current) =>
      current.includes(hostKey)
        ? current.filter((candidate) => candidate !== hostKey)
        : [...current, hostKey]
    )
  }
  useAutomationRunsViewerController({
    query,
    deferredQuery,
    status,
    hostKeys,
    hostOptions,
    visibleEntries,
    visibleFailureCount: visibleFailures.length,
    loading,
    hasMore,
    setQuery,
    setStatus,
    setHostKeys,
    toggleHost,
    request,
    onOpenRun,
    onRefresh,
    onLoadMore
  })
  return {
    query,
    setQuery,
    status,
    setStatus,
    hostKeys,
    setHostKeys,
    hostOptions,
    toggleHost,
    counts,
    visibleEntries,
    visibleFailures,
    activeFilterCount
  }
}
