import {
  automationRowActionTarget,
  automationRowActionOwner as automationRowViewerOwner,
  isAutomationRowActionEnabled,
  dispatchAutomationRowAction,
  type AutomationRowActionTarget
} from './automation-row-viewer-target'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  AutomationRowViewerActionSchema,
  type AutomationRowViewerAction
} from '../../../shared/automation-row-viewer-command'
import type { AutomationMutationOutcome } from '../components/automations/automation-mutation-outcome'
import {
  automationRowViewerScope,
  automationRowViewerSnapshot as snapshot,
  type AutomationRowViewerPage,
  type AutomationRowViewerState
} from './automation-row-viewer-state'

type Control = {
  get: () => AutomationRowViewerState
  apply: (action: AutomationRowViewerAction) => Promise<AutomationRowViewerState>
}
const mounted = new Set<Control>()
export function automationRowViewerSnapshot() {
  return mounted.size === 1 ? (mounted.values().next().value?.get() ?? null) : null
}
export function isAutomationRowViewerBusy(): boolean {
  return [...mounted].some((control) => control.get().busy)
}
export async function applyAutomationRowViewerAction(action: AutomationRowViewerAction) {
  const parsed = AutomationRowViewerActionSchema.parse(action)
  if (mounted.size !== 1) {
    throw new Error(mounted.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mounted.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.apply(parsed)
}
export function useAutomationRowViewerController(page: AutomationRowViewerPage): void {
  type Row = AutomationRowActionTarget
  type Request = {
    row: Row
    owner: string
    invalidated: boolean
    ready: boolean
    outcome: AutomationMutationOutcome | null
    resolve: (state: AutomationRowViewerState) => void
    reject: (error: Error) => void
  }
  const scope = automationRowViewerScope(page)
  const target = useRef({ scope, token: createBrowserUuid() })
  const latest = useRef(page)
  const alive = useRef(false)
  const pending = useRef<Request | null>(null)
  const result = useRef<{
    row: Row | null
    owner: string | null
    outcome: AutomationMutationOutcome | null
  }>({ row: null, owner: null, outcome: null })
  const [, setRevision] = useState(0)
  const get = () =>
    snapshot(
      latest.current,
      target.current.token,
      Boolean(pending.current),
      result.current.row?.key ?? null,
      result.current.outcome
    )
  useLayoutEffect(() => {
    latest.current = page
    if (target.current.scope !== scope) {
      target.current = { scope, token: createBrowserUuid() }
    }
    const previous = result.current
    if (previous.row && automationRowViewerOwner(page, previous.row) !== previous.owner) {
      result.current = { row: null, owner: null, outcome: null }
    }
    const request = pending.current
    if (
      request &&
      !request.invalidated &&
      automationRowViewerOwner(page, request.row) !== request.owner
    ) {
      request.invalidated = true
      request.reject(new Error('viewer_target_changed'))
    }
  })
  useEffect(() => {
    const request = pending.current
    if (!request?.ready) {
      return
    }
    pending.current = null
    if (request.invalidated) {
      return
    }
    if (automationRowViewerOwner(page, request.row) !== request.owner) {
      request.reject(new Error('viewer_target_changed'))
      return
    }
    result.current = { row: request.row, owner: request.owner, outcome: request.outcome }
    request.resolve(get())
  })
  useEffect(() => {
    alive.current = true
    const control: Control = {
      get,
      apply: async (action) => {
        if (!alive.current) {
          throw new Error('viewer_unmounted')
        }
        if (action.kind === 'get') {
          return get()
        }
        if (pending.current) {
          throw new Error('viewer_busy')
        }
        const current = latest.current
        if (action.reviewedTarget !== target.current.token) {
          throw new Error('viewer_target_changed')
        }
        if (
          current.modalOpen ||
          current.local.createOpen ||
          current.local.deleteTarget ||
          current.local.externalDeleteTarget
        ) {
          throw new Error('viewer_modal_open')
        }
        if (!current.list.searchSettled) {
          throw new Error('automation_rows_not_ready')
        }
        const row = automationRowActionTarget(current, action.rowKey)
        if (!row) {
          throw new Error('automation_row_not_visible')
        }
        if (!isAutomationRowActionEnabled(current, row, action.kind)) {
          throw new Error('automation_row_action_unavailable')
        }
        return new Promise((resolve, reject) => {
          const request: Request = {
            row,
            owner: automationRowViewerOwner(current, row),
            invalidated: false,
            ready: false,
            outcome: null,
            resolve,
            reject
          }
          pending.current = request
          result.current = { row: null, owner: null, outcome: null }
          setRevision((value) => value + 1)
          void Promise.resolve()
            .then(() => {
              if (
                !alive.current ||
                request.invalidated ||
                action.reviewedTarget !== target.current.token ||
                automationRowViewerOwner(latest.current, row) !== request.owner
              ) {
                throw new Error(alive.current ? 'viewer_target_changed' : 'viewer_unmounted')
              }
              return dispatchAutomationRowAction(current, row, action.kind)
            })
            .then(
              (outcome) => {
                if (pending.current !== request) {
                  return
                }
                request.outcome = outcome
                request.ready = true
                if (alive.current) {
                  setRevision((value) => value + 1)
                } else {
                  pending.current = null
                }
              },
              (error: unknown) => {
                if (pending.current !== request) {
                  return
                }
                pending.current = null
                if (!request.invalidated) {
                  reject(error instanceof Error ? error : new Error('automation_row_action_failed'))
                }
                if (alive.current) {
                  setRevision((value) => value + 1)
                }
              }
            )
        })
      }
    }
    mounted.add(control)
    return () => {
      alive.current = false
      mounted.delete(control)
      const request = pending.current
      if (request && !request.invalidated) {
        request.invalidated = true
        request.reject(new Error('viewer_unmounted'))
      }
    }
  }, [])
}
