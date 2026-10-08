import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  AutomationRunsViewerActionSchema,
  type AutomationRunsViewerAction
} from '../../../shared/automation-runs-viewer-command'
import {
  automationRunsFormSnapshot,
  automationRunsReviewScope,
  type AutomationRunsViewerForm,
  type AutomationRunsViewerState
} from './automation-runs-viewer-state'

type RunTarget = { rowKey: string; runId: string; open: () => void }
type Control = {
  prepareOpen: (entryKey: string, reviewedTarget: string) => RunTarget
  get: () => AutomationRunsViewerState
  apply: (action: AutomationRunsViewerAction) => Promise<AutomationRunsViewerState>
}
const mounted = new Set<Control>()
export function automationRunsViewerSnapshot() {
  return mounted.size === 1 ? (mounted.values().next().value?.get() ?? null) : null
}
export function isAutomationRunsViewerBusy(): boolean {
  return [...mounted].some((control) => control.get().busy)
}
export async function applyAutomationRunsViewerAction(action: AutomationRunsViewerAction) {
  const parsed = AutomationRunsViewerActionSchema.parse(action)
  if (mounted.size !== 1) {
    throw new Error(mounted.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mounted.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.apply(parsed)
}

export function prepareAutomationRunsViewerOpen(
  entryKey: string,
  reviewedTarget: string
): RunTarget {
  if (mounted.size !== 1) {
    throw new Error(mounted.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mounted.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.prepareOpen(entryKey, reviewedTarget)
}

export function useAutomationRunsViewerController(form: AutomationRunsViewerForm): void {
  const scope = automationRunsReviewScope(form)
  const target = useRef({ scope, token: createBrowserUuid() })
  const lastOperation = useRef<{
    owner: string | null
    kind: 'refresh' | 'load-more' | null
  }>({ owner: null, kind: null })
  const latest = useRef(form)
  const pending = useRef<{
    action: AutomationRunsViewerAction
    expectedHostKeys: string[]
    invalidated: boolean
    io?: { owner: string; revision: number }
    resolve: (state: AutomationRunsViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  const [, setRevision] = useState(0)
  const get = () =>
    automationRunsFormSnapshot(
      latest.current,
      Boolean(pending.current),
      target.current.token,
      lastOperation.current.kind
    )
  useLayoutEffect(() => {
    latest.current = form
    if (target.current.scope !== scope) {
      target.current = { scope, token: createBrowserUuid() }
    }
    if (lastOperation.current.owner !== (form.request?.ownerKey ?? null)) {
      lastOperation.current = { owner: null, kind: null }
    }
    const request = pending.current
    if (request?.io && !request.invalidated && request.io.owner !== form.request?.ownerKey) {
      request.invalidated = true
      request.reject(new Error('viewer_target_changed'))
    }
  })
  useEffect(() => {
    const request = pending.current
    if (!request || form.query !== form.deferredQuery) {
      return
    }
    if (
      request.io &&
      form.request &&
      (form.loading || form.request.settledRevision <= request.io.revision)
    ) {
      return
    }
    pending.current = null
    if (request.invalidated) {
      return
    }
    const { action, expectedHostKeys } = request
    if (action.kind === 'refresh' || action.kind === 'load-more') {
      lastOperation.current = { owner: form.request?.ownerKey ?? null, kind: action.kind }
      request.resolve(get())
      return
    }
    if (
      (action.kind === 'query' && form.query !== action.value) ||
      (action.kind === 'status' && form.status !== action.value) ||
      (['hosts', 'host-toggle', 'hosts-clear'].includes(action.kind) &&
        JSON.stringify(form.hostKeys) !== JSON.stringify(expectedHostKeys))
    ) {
      request.reject(new Error('viewer_target_changed'))
    } else {
      request.resolve(get())
    }
  })
  useEffect(() => {
    const control: Control = {
      get,
      prepareOpen: (entryKey, reviewedTarget) => {
        const current = latest.current
        if (pending.current || current.loading || current.query !== current.deferredQuery) {
          throw new Error('viewer_busy')
        }
        if (reviewedTarget !== target.current.token) {
          throw new Error('viewer_target_changed')
        }
        const entry = current.visibleEntries.find((candidate) => candidate.key === entryKey)
        if (!entry) {
          throw new Error('automation_run_not_visible')
        }
        return {
          rowKey: entry.row.key,
          runId: entry.run.id,
          open: () => current.onOpenRun(entry)
        }
      },
      apply: async (action) => {
        if (action.kind === 'get') {
          return get()
        }
        if (pending.current) {
          throw new Error('viewer_busy')
        }
        const current = latest.current
        const io = action.kind === 'refresh' || action.kind === 'load-more'
        if (io) {
          if (!current.request) {
            throw new Error('viewer_unavailable')
          }
          if (action.reviewedTarget !== target.current.token) {
            throw new Error('viewer_target_changed')
          }
          if (current.loading) {
            throw new Error('viewer_busy')
          }
          if (action.kind === 'load-more' && !current.hasMore) {
            throw new Error('automation_runs_no_more')
          }
        }
        const keys =
          action.kind === 'hosts'
            ? action.values
            : action.kind === 'host-toggle'
              ? [action.value]
              : []
        if (keys.some((key) => !current.hostOptions.some((host) => host.key === key))) {
          throw new Error('automation_runs_host_not_loaded')
        }
        const expectedHostKeys =
          action.kind === 'hosts'
            ? action.values
            : action.kind === 'host-toggle'
              ? current.hostKeys.includes(action.value)
                ? current.hostKeys.filter((key) => key !== action.value)
                : [...current.hostKeys, action.value]
              : []
        return new Promise((resolve, reject) => {
          pending.current = {
            action,
            expectedHostKeys,
            resolve,
            reject,
            invalidated: false,
            io:
              io && current.request
                ? { owner: current.request.ownerKey, revision: current.request.settledRevision }
                : undefined
          }
          if (io) {
            lastOperation.current = { owner: null, kind: null }
          }
          switch (action.kind) {
            case 'refresh':
              current.onRefresh()
              break
            case 'load-more':
              current.onLoadMore()
              break
            case 'query':
              current.setQuery(action.value)
              break
            case 'status':
              current.setStatus(action.value)
              break
            case 'hosts':
              current.setHostKeys(action.values)
              break
            case 'host-toggle':
              current.toggleHost(action.value)
              break
            case 'hosts-clear':
              current.setHostKeys([])
              break
          }
          setRevision((value) => value + 1)
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
