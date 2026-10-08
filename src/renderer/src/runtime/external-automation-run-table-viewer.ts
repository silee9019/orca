import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  ExternalAutomationRunsViewerActionSchema,
  type ExternalAutomationRunsViewerAction as Action
} from '../../../shared/external-automation-runs-viewer-command'
import type { ExternalAutomationRun } from '../../../shared/automations-types'

type Form = {
  tableKey: string
  ownerKey: string
  page: number
  totalPages: number
  totalCount: number
  selectedRunId: string | null
  visibleRuns: ExternalAutomationRun[]
  loading: boolean
  error: string | null
  modalOpen: boolean
  openRequested: boolean
  onPage: (page: number) => void
  onSelect: (run: ExternalAutomationRun) => void
}
export type ExternalAutomationRunTableViewerState = {
  tableKey: string
  reviewedTarget: string
  page: number
  totalPages: number
  totalCount: number
  visibleRunIds: string[]
  selectedRunId: string | null
  loading: boolean
  readStatus: 'loading' | 'failed' | 'loaded'
  modalOpen: boolean
  busy: boolean
  closed: boolean
  completed?: {
    kind: 'page' | 'select'
    openRequested: boolean
    reviewStatus: 'current' | 'changed'
  }
}
type State = ExternalAutomationRunTableViewerState
type Pending = {
  before: State
  owner: string
  ownerChanged: boolean
  targetPage: number
  selectedRunId: string | null
  kind: 'page' | 'select'
  ready: boolean
  openRequested: boolean
  resolve: (state: State) => void
  reject: (error: Error) => void
}
type Control = { get: () => State; apply: (action: Action) => Promise<State>; busy: () => boolean }
const mounted = new Set<Control>()
export function externalAutomationRunTablesSnapshot(): State[] {
  return [...mounted].map((entry) => entry.get())
}
export function isExternalAutomationRunTableViewerBusy(): boolean {
  return [...mounted].some((entry) => entry.busy())
}
export async function applyExternalAutomationRunTableViewer(
  tableKey: string,
  action: Action
): Promise<State> {
  const parsed = ExternalAutomationRunsViewerActionSchema.parse(action)
  const candidates = [...mounted].filter((entry) => entry.get().tableKey === tableKey)
  if (candidates.length !== 1) {
    throw new Error(candidates.length ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  return candidates[0].apply(parsed)
}
export function useExternalAutomationRunTableViewer(form: Form): void {
  const latest = useRef(form)
  const target = useRef({ scope: '', token: createBrowserUuid() })
  const pending = useRef<Pending | null>(null)
  const [, setRevision] = useState(0)
  const get = (): State => {
    const current = latest.current
    const scope = JSON.stringify([
      current.ownerKey,
      current.tableKey,
      current.page,
      current.totalCount,
      current.selectedRunId,
      current.loading,
      current.error,
      current.modalOpen,
      current.visibleRuns.map((run) => run.id)
    ])
    if (target.current.scope !== scope) {
      target.current = { scope, token: createBrowserUuid() }
    }
    return {
      tableKey: current.tableKey,
      reviewedTarget: target.current.token,
      page: current.page,
      totalPages: current.totalPages,
      totalCount: current.totalCount,
      visibleRunIds: current.visibleRuns.map((run) => run.id),
      selectedRunId: current.selectedRunId,
      loading: current.loading,
      readStatus: current.loading ? 'loading' : current.error ? 'failed' : 'loaded',
      modalOpen: current.modalOpen,
      busy: Boolean(pending.current),
      closed: false
    }
  }
  const result = (request: Pending, closed = false): State => ({
    ...(closed ? request.before : get()),
    selectedRunId: request.kind === 'select' ? request.selectedRunId : get().selectedRunId,
    busy: false,
    closed,
    completed: {
      kind: request.kind,
      openRequested: request.openRequested,
      reviewStatus: request.ownerChanged ? 'changed' : 'current'
    }
  })
  useLayoutEffect(() => {
    latest.current = form
    if (pending.current && pending.current.owner !== form.ownerKey) {
      pending.current.ownerChanged = true
    }
    get()
  })
  useEffect(() => {
    const request = pending.current
    if (!request) {
      return
    }
    if (request.ownerChanged && request.kind === 'page') {
      pending.current = null
      request.reject(new Error('viewer_target_changed'))
    } else if (
      request.ready &&
      (request.kind === 'select' || (!form.loading && form.page === request.targetPage))
    ) {
      pending.current = null
      request.resolve(result(request))
    }
  })
  useEffect(() => {
    const control: Control = {
      get,
      busy: () => Boolean(pending.current),
      apply: async (action) => {
        const state = get()
        if (action.kind === 'get') {
          return state
        }
        if (state.busy || state.loading) {
          throw new Error('viewer_busy')
        }
        if (action.reviewedTarget !== state.reviewedTarget) {
          throw new Error('viewer_target_changed')
        }
        if (state.modalOpen) {
          throw new Error('viewer_modal_open')
        }
        const page =
          action.kind === 'page' ? state.page + (action.direction === 'next' ? 1 : -1) : state.page
        if (page < 0 || page >= state.totalPages) {
          throw new Error('automation_run_page_unavailable')
        }
        const run =
          action.kind === 'select'
            ? latest.current.visibleRuns.find((entry) => entry.id === action.runId)
            : null
        if (action.kind === 'select' && !run) {
          throw new Error('automation_run_not_visible')
        }
        return new Promise((resolve, reject) => {
          const request: Pending = {
            before: state,
            owner: latest.current.ownerKey,
            ownerChanged: false,
            targetPage: page,
            selectedRunId: run?.id ?? null,
            kind: action.kind,
            ready: false,
            openRequested: action.kind === 'select' && latest.current.openRequested,
            resolve,
            reject
          }
          pending.current = request
          try {
            if (run) {
              latest.current.onSelect(run)
            } else {
              latest.current.onPage(page)
            }
            request.ready = true
          } catch (error) {
            pending.current = null
            reject(error instanceof Error ? error : new Error('external_run_table_action_failed'))
          }
          setRevision((value) => value + 1)
        })
      }
    }
    mounted.add(control)
    return () => {
      mounted.delete(control)
      const request = pending.current
      if (request?.ready && request.kind === 'select') {
        request.resolve(result(request, true))
      } else {
        request?.reject(new Error('viewer_unmounted'))
      }
      pending.current = null
    }
  }, [])
}
