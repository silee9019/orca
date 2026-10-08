import { prepareAutomationHistoryViewerOpen } from './automation-history-viewer'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { prepareAutomationRunsViewerOpen } from './automation-runs-viewer-controller'

type NavigationForm = {
  ownerKeys: ReadonlyMap<string, string>
  profileId?: string | null
  selectedAutomationId?: string | null
  view: string
  origin: 'runs' | 'automation'
  selectedRowKey: string | null
  selectedRunId: string | null
  pendingRunId: string | null
  detailOpen: boolean
}
type NavigationState = {
  rowKey: string | null
  runId: string | null
  pendingRunId: string | null
  origin: 'runs' | 'automation'
  busy: boolean
}
type NavigationControl = {
  get: () => NavigationState
  open: (
    entryKey: string,
    reviewedTarget: string,
    source?: 'runs' | 'history'
  ) => Promise<NavigationState>
}
const mounted = new Set<NavigationControl>()
export function automationRunNavigationSnapshot(): NavigationState | null {
  return mounted.size === 1 ? (mounted.values().next().value?.get() ?? null) : null
}
export function isAutomationRunNavigationBusy(): boolean {
  return [...mounted].some((control) => control.get().busy)
}
export function applyAutomationRunNavigation(
  entryKey: string,
  reviewedTarget: string,
  source: 'runs' | 'history' = 'runs'
) {
  if (mounted.size !== 1) {
    throw new Error(mounted.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mounted.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.open(entryKey, reviewedTarget, source)
}

export function useAutomationRunNavigationViewer(form: NavigationForm): void {
  const latest = useRef(form)
  const pending = useRef<{
    origin: 'runs' | 'automation'
    profileId: string | null | undefined
    rowKey: string
    runId: string
    owner: string
    resolve: (state: NavigationState) => void
    reject: (error: Error) => void
  } | null>(null)
  const [, setRevision] = useState(0)
  const get = (): NavigationState => ({
    rowKey: latest.current.selectedRowKey,
    runId: latest.current.selectedRunId,
    pendingRunId: latest.current.pendingRunId,
    origin: latest.current.origin,
    busy: Boolean(pending.current)
  })
  useLayoutEffect(() => {
    latest.current = form
  })
  useEffect(() => {
    const request = pending.current
    if (!request) {
      return
    }
    if (
      form.profileId !== request.profileId ||
      form.ownerKeys.get(request.rowKey) !== request.owner
    ) {
      pending.current = null
      request.reject(new Error('viewer_target_changed'))
      return
    }
    if (
      form.pendingRunId !== null &&
      form.pendingRunId === request.runId &&
      form.view === 'run' &&
      form.origin === request.origin
    ) {
      return
    }
    pending.current = null
    if (
      form.view !== 'run' ||
      form.origin !== request.origin ||
      !form.detailOpen ||
      form.selectedRowKey !== request.rowKey ||
      form.selectedRunId !== request.runId
    ) {
      request.reject(new Error('automation_run_navigation_failed'))
    } else {
      request.resolve(get())
    }
  })
  useEffect(() => {
    const control: NavigationControl = {
      get,
      open: async (entryKey, reviewedTarget, source = 'runs') => {
        if (pending.current) {
          throw new Error('viewer_busy')
        }
        const current = latest.current
        if (
          source === 'history'
            ? current.view !== 'automations' || !current.detailOpen || !current.selectedRowKey
            : current.view !== 'runs'
        ) {
          throw new Error('viewer_unavailable')
        }
        const history =
          source === 'history' ? prepareAutomationHistoryViewerOpen(entryKey, reviewedTarget) : null
        if (history && history.automationId !== current.selectedAutomationId) {
          throw new Error('viewer_target_changed')
        }
        const target = history
          ? { ...history, rowKey: current.selectedRowKey }
          : prepareAutomationRunsViewerOpen(entryKey, reviewedTarget)
        if (!target.rowKey) {
          throw new Error('viewer_target_changed')
        }
        const rowKey = target.rowKey
        const owner = latest.current.ownerKeys.get(rowKey)
        if (!owner) {
          throw new Error('viewer_target_changed')
        }
        return new Promise((resolve, reject) => {
          pending.current = {
            rowKey,
            runId: target.runId,
            owner,
            profileId: current.profileId,
            origin: source === 'history' ? 'automation' : 'runs',
            resolve,
            reject
          }
          try {
            target.open()
            setRevision((value) => value + 1)
          } catch (error) {
            pending.current = null
            reject(error instanceof Error ? error : new Error('automation_run_navigation_failed'))
          }
        })
      }
    }
    mounted.add(control)
    return () => {
      mounted.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
}
