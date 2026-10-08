import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { useExternalAutomationRunTableViewer } from '../../runtime/external-automation-run-table-viewer'
import {
  externalAutomationScopeKey,
  externalAutomationJobKey
} from './external-automation-scope-keys'
import {
  createExternalAutomationRunTableState,
  resolveExternalAutomationFetchedRuns,
  resolveExternalAutomationRunTableState,
  updateExternalAutomationRunTablePage
} from './external-automation-run-table-state'
import type { ExternalAutomationRun } from '../../../../shared/automations-types'
import type {
  ExternalAutomationRunTableProps,
  ExternalAutomationRunPage
} from './ExternalAutomationRunTable'
const PAGE_SIZE = 8
function normalizeRunPage(
  result: ExternalAutomationRun[] | ExternalAutomationRunPage
): ExternalAutomationRunPage {
  return Array.isArray(result) ? { runs: result } : result
}
export function useExternalAutomationRunTable({
  scope,
  manager,
  job,
  onFetchRuns,
  onOpenRun
}: ExternalAutomationRunTableProps) {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const [tableState, setTableState] = useState(() => createExternalAutomationRunTableState(job))
  const [load, setLoad] = useState<{ key: string; pending: boolean } | null>(null)
  const scopeRef = useRef(scope)
  const managerRef = useRef(manager)
  const jobRef = useRef(job)

  scopeRef.current = scope
  managerRef.current = manager
  jobRef.current = job
  // Refetch when the host changes, not just the job: the same manager and job ID
  // can be a different machine's cron entry.
  const scopeKey = externalAutomationScopeKey(scope)

  const resolvedTableState = resolveExternalAutomationRunTableState(tableState, job)
  if (resolvedTableState !== tableState) {
    // Why: manager rows can switch jobs while the table stays mounted; reset
    // before paint so stale fetched rows/selection never flash for the new job.
    setTableState(resolvedTableState)
  }
  const { page, selectedRunId, fetchedRuns, fetchedTotalCount, fetchError } = resolvedTableState
  const readKey = JSON.stringify([scopeKey, manager.id, job.id, page])
  const isLoading = Boolean(onFetchRuns && (load?.key !== readKey || load.pending))

  useEffect(() => {
    if (!onFetchRuns) {
      return
    }
    let cancelled = false
    setLoad({ key: readKey, pending: true })
    setTableState((current) => ({
      ...resolveExternalAutomationRunTableState(current, jobRef.current),
      fetchError: null
    }))
    void onFetchRuns({
      scope: scopeRef.current,
      manager: managerRef.current,
      job: jobRef.current,
      page,
      pageSize: PAGE_SIZE
    })
      .then((result) => {
        if (cancelled) {
          return
        }
        const nextPage = normalizeRunPage(result)
        setTableState((current) =>
          resolveExternalAutomationFetchedRuns(current, jobRef.current, nextPage)
        )
      })
      .catch((error) => {
        if (!cancelled) {
          setTableState((current) => ({
            ...resolveExternalAutomationRunTableState(current, jobRef.current),
            fetchedRuns: null,
            fetchedTotalCount: null,
            fetchError: error instanceof Error ? error.message : 'Failed to load runs.'
          }))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoad({ key: readKey, pending: false })
        }
      })
    return () => {
      cancelled = true
    }
  }, [onFetchRuns, page, readKey])

  const currentFetchedRuns = load?.key === readKey && !load.pending ? fetchedRuns : null
  const currentTotal = load?.key === readKey && !load.pending ? fetchedTotalCount : null
  const fallbackRuns = job.runs
  const visibleRuns = onFetchRuns
    ? (currentFetchedRuns ?? fallbackRuns.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE))
    : fallbackRuns.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const totalCount = onFetchRuns ? (currentTotal ?? job.runCount) : job.runCount
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const selectedRun = useMemo(
    () =>
      visibleRuns.find((run) => run.id === selectedRunId) ??
      fallbackRuns.find((run) => run.id === selectedRunId) ??
      visibleRuns[0] ??
      null,
    [fallbackRuns, selectedRunId, visibleRuns]
  )
  const hasVisibleRuns = visibleRuns.length > 0
  const pageStart = totalCount === 0 || !hasVisibleRuns ? 0 : page * PAGE_SIZE + 1
  const pageEnd = Math.min(totalCount, page * PAGE_SIZE + visibleRuns.length)

  const handlePageChange = (nextPage: number): void => {
    setTableState((current) => updateExternalAutomationRunTablePage(current, job, nextPage))
  }

  const handleRunSelect = (run: ExternalAutomationRun): void => {
    if (isLoading) {
      return
    }
    setTableState((current) => ({
      ...resolveExternalAutomationRunTableState(current, job),
      selectedRunId: run.id
    }))
    onOpenRun?.(run)
  }
  useExternalAutomationRunTableViewer({
    tableKey: externalAutomationJobKey(scope, job.id),
    ownerKey: JSON.stringify([profile, scope, manager.id, manager.target]),
    page,
    totalPages,
    totalCount,
    selectedRunId: selectedRun?.id ?? null,
    visibleRuns,
    loading: isLoading,
    error: fetchError,
    onPage: handlePageChange,
    onSelect: handleRunSelect,
    openRequested: Boolean(onOpenRun),
    modalOpen: modal !== 'none'
  })
  return {
    visibleRuns,
    totalCount,
    totalPages,
    selectedRun,
    hasVisibleRuns,
    pageStart,
    pageEnd,
    page,
    isLoading,
    fetchError,
    handlePageChange,
    handleRunSelect
  }
}
