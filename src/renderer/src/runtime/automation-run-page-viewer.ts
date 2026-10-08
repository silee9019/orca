import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  AutomationRunPageViewerActionSchema,
  type AutomationRunPageViewerAction
} from '../../../shared/automation-run-page-viewer-command'
import type { AutomationMutationOutcome } from '../components/automations/automation-mutation-outcome'
import type { AutomationRunWorkspaceOutcome } from '../components/automations/automation-run-workspace-action'

export type AutomationRunPageViewerForm = {
  enabled: boolean
  source?: 'orca' | 'external'
  ownerKey: string
  targetKey: string
  runId: string | null
  rowKey: string | null
  origin: 'runs' | 'automation'
  modalOpen: boolean
  canRerun: boolean
  rerunPending: boolean
  canOpenWorkspace: boolean
  onBack: () => void
  onRerun: () => Promise<AutomationMutationOutcome>
  onOpenWorkspace: () => AutomationRunWorkspaceOutcome
}
export type AutomationRunPageViewerState = {
  reviewedTarget: string
  source: 'orca' | 'external'
  runId: string | null
  rowKey: string | null
  origin: 'runs' | 'automation'
  canRerun: boolean
  canOpenWorkspace: boolean
  modalOpen: boolean
  busy: boolean
  closed: boolean
  completed?: {
    action: 'back' | 'open-workspace' | 'rerun'
    reviewStatus: 'current' | 'changed'
    mutation?: AutomationMutationOutcome
    workspace?: AutomationRunWorkspaceOutcome
  }
}
type State = AutomationRunPageViewerState
type Action = AutomationRunPageViewerAction
type Pending = {
  action: Exclude<Action, { kind: 'get' }>
  before: State
  owner: string
  ownerChanged: boolean
  ready: boolean
  outcome: State['completed']
  resolve: (state: State) => void
  reject: (error: Error) => void
}
type Control = {
  get: () => State | null
  isBusy: () => boolean
  apply: (action: Action) => Promise<State>
}
const mounted = new Set<Control>()
export function automationRunPageViewerSnapshot(): State | null {
  const states = [...mounted].map((entry) => entry.get()).filter((state) => state !== null)
  return states.length === 1 ? states[0] : null
}
export function isAutomationRunPageViewerBusy(): boolean {
  return [...mounted].some((entry) => entry.isBusy())
}
export async function applyAutomationRunPageViewer(action: Action): Promise<State> {
  const parsed = AutomationRunPageViewerActionSchema.parse(action)
  const active = [...mounted].filter((entry) => entry.get() !== null)
  if (active.length !== 1) {
    throw new Error(active.length ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = active[0]
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.apply(parsed)
}
export function useAutomationRunPageViewer(form: AutomationRunPageViewerForm): void {
  const latest = useRef(form)
  const pending = useRef<Pending | null>(null)
  const target = useRef({ scope: '', token: createBrowserUuid() })
  const [, setRevision] = useState(0)
  const get = (): State | null => {
    const current = latest.current
    const scope = JSON.stringify([
      current.enabled,
      current.source,
      current.ownerKey,
      current.targetKey,
      current.runId,
      current.rowKey,
      current.origin,
      current.modalOpen,
      current.canRerun,
      current.canOpenWorkspace
    ])
    if (target.current.scope !== scope) {
      target.current = { scope, token: createBrowserUuid() }
    }
    if (!current.enabled) {
      return null
    }
    return {
      reviewedTarget: target.current.token,
      source: current.source ?? 'orca',
      runId: current.runId,
      rowKey: current.rowKey,
      origin: current.origin,
      canRerun: current.canRerun,
      canOpenWorkspace: current.canOpenWorkspace,
      modalOpen: current.modalOpen,
      busy: Boolean(pending.current || current.rerunPending),
      closed: false
    }
  }
  const finish = (request: Pending, closed = false): State => ({
    ...(get() ?? request.before),
    busy: false,
    closed,
    completed: request.outcome
      ? { ...request.outcome, reviewStatus: request.ownerChanged ? 'changed' : 'current' }
      : undefined
  })
  useLayoutEffect(() => {
    latest.current = form
    if (
      pending.current &&
      pending.current.owner !== JSON.stringify([form.ownerKey, form.targetKey, form.runId])
    ) {
      pending.current.ownerChanged = true
    }
    get()
  })
  useEffect(() => {
    const request = pending.current
    if (!request?.ready) {
      return
    }
    pending.current = null
    request.resolve(finish(request, !form.enabled))
  })
  useEffect(() => {
    const control: Control = {
      get,
      isBusy: () => Boolean(pending.current || latest.current.rerunPending),
      apply: async (action) => {
        const state = get()
        if (!state) {
          throw new Error('viewer_unavailable')
        }
        if (action.kind === 'get') {
          return state
        }
        if (state.busy) {
          throw new Error('viewer_busy')
        }
        if (state.reviewedTarget !== action.reviewedTarget) {
          throw new Error('viewer_target_changed')
        }
        if (state.modalOpen) {
          throw new Error('viewer_modal_open')
        }
        if (
          (action.kind === 'rerun' && !state.canRerun) ||
          (action.kind === 'open-workspace' && !state.canOpenWorkspace)
        ) {
          throw new Error('automation_run_action_unavailable')
        }
        return new Promise((resolve, reject) => {
          const request: Pending = {
            action,
            before: state,
            owner: JSON.stringify([
              latest.current.ownerKey,
              latest.current.targetKey,
              latest.current.runId
            ]),
            ownerChanged: false,
            ready: false,
            outcome: undefined,
            resolve,
            reject
          }
          pending.current = request
          const complete = (outcome: State['completed']) => {
            if (pending.current !== request) {
              return
            }
            request.outcome = outcome
            request.ready = true
            setRevision((value) => value + 1)
          }
          try {
            if (action.kind === 'rerun') {
              void latest.current.onRerun().then(
                (mutation) => complete({ action: 'rerun', reviewStatus: 'current', mutation }),
                (error: unknown) => {
                  if (pending.current !== request) {
                    return
                  }
                  pending.current = null
                  reject(error instanceof Error ? error : new Error('automation_rerun_failed'))
                  setRevision((value) => value + 1)
                }
              )
            } else if (action.kind === 'open-workspace') {
              complete({
                action: action.kind,
                reviewStatus: 'current',
                workspace: latest.current.onOpenWorkspace()
              })
            } else {
              latest.current.onBack()
              complete({ action: 'back', reviewStatus: 'current' })
            }
          } catch (error) {
            pending.current = null
            reject(error instanceof Error ? error : new Error('automation_run_action_failed'))
          }
          setRevision((value) => value + 1)
        })
      }
    }
    mounted.add(control)
    return () => {
      mounted.delete(control)
      const request = pending.current
      if (request?.ready) {
        request.resolve(finish(request, true))
      } else {
        request?.reject(new Error('viewer_unmounted'))
      }
      pending.current = null
    }
  }, [])
}
