import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  AutomationDeleteViewerActionSchema,
  type AutomationDeleteViewerAction
} from '../../../shared/automation-delete-viewer-command'
import type { AutomationMutationOutcome } from '../components/automations/automation-mutation-outcome'
import {
  automationDeletionOwnerState,
  automationDeletionSnapshot,
  automationDeletionTarget,
  type AutomationDeleteViewerPage,
  type AutomationDeleteViewerState
} from './automation-delete-viewer-state'

type Control = {
  get: () => AutomationDeleteViewerState
  apply: (action: AutomationDeleteViewerAction) => Promise<AutomationDeleteViewerState>
}
const mountedDeletions = new Set<Control>()
export function automationDeleteViewerSnapshot() {
  return mountedDeletions.size === 1
    ? (mountedDeletions.values().next().value?.get() ?? null)
    : null
}
export function isAutomationDeleteViewerBusy(): boolean {
  return automationDeleteViewerSnapshot()?.busy ?? false
}
export async function applyAutomationDeleteViewerAction(action: AutomationDeleteViewerAction) {
  const parsed = AutomationDeleteViewerActionSchema.parse(action)
  if (mountedDeletions.size !== 1) {
    throw new Error(mountedDeletions.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedDeletions.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.apply(parsed)
}
export function useAutomationDeleteViewerController(page: AutomationDeleteViewerPage): void {
  const target = automationDeletionTarget(page)
  const owner = automationDeletionOwnerState(page)
  const anchor = useRef({ target, signature: owner.signature, token: createBrowserUuid() })
  const latest = useRef({ page, token: target ? anchor.current.token : null })
  const outcome = useRef<AutomationMutationOutcome | null>(null)
  const [, setRevision] = useState(0)
  type Request = {
    action: AutomationDeleteViewerAction
    target: typeof target
    token: string | null
    ready: boolean
    mutation: boolean
    outcome: AutomationMutationOutcome | null
    resolve: (value: AutomationDeleteViewerState) => void
    reject: (error: Error) => void
  }
  const pending = useRef<Request | null>(null)
  const snapshot = useCallback(
    (): AutomationDeleteViewerState =>
      automationDeletionSnapshot(
        latest.current.page,
        latest.current.token,
        pending.current !== null,
        outcome.current
      ),
    []
  )
  useLayoutEffect(() => {
    if (anchor.current.target !== target || anchor.current.signature !== owner.signature) {
      anchor.current = { target, signature: owner.signature, token: createBrowserUuid() }
      if (target) {
        outcome.current = null
      }
    }
    latest.current = { page, token: target ? anchor.current.token : null }
    const request = pending.current
    if (!request) {
      return
    }
    const action = request.action
    const state = snapshot()
    const changed = request.mutation
      ? target !== null && target !== request.target
      : action.kind === 'request'
        ? target !== null && (state.source !== action.source || state.rowKey !== action.rowKey)
        : action.kind === 'cancel' || action.kind === 'dismiss'
          ? target !== null && (target !== request.target || state.reviewedTarget !== request.token)
          : target !== request.target || state.reviewedTarget !== request.token
    if (changed || (request.ready && !request.mutation && action.kind === 'request' && !target)) {
      pending.current = null
      request.reject(new Error('viewer_target_changed'))
      return
    }
    if (!request.ready) {
      return
    }
    const closed =
      !state.open &&
      page.local.deleteOperationCountRef.current === 0 &&
      page.local.externalActionKey === null
    const committed =
      request.mutation || action.kind === 'cancel' || action.kind === 'dismiss'
        ? closed
        : action.kind === 'request'
          ? state.open && state.source === action.source && state.rowKey === action.rowKey
          : action.kind === 'dont-ask-again'
            ? state.open && state.dontAskAgain === action.value
            : action.kind === 'focus' && state.open && state.confirmFocused
    if (committed) {
      pending.current = null
      if (request.mutation) {
        outcome.current = request.outcome
      }
      request.resolve(snapshot())
    }
  })
  useEffect(() => {
    const control: Control = {
      get: snapshot,
      apply: async (action) => {
        const current = latest.current.page
        const state = snapshot()
        if (action.kind === 'get') {
          return state
        }
        if (state.busy) {
          throw new Error('viewer_busy')
        }
        if (current.local.createOpen) {
          throw new Error('viewer_modal_open')
        }
        if (action.kind !== 'request') {
          if (!state.open) {
            throw new Error('automation_delete_unavailable')
          }
          if (action.reviewedTarget !== state.reviewedTarget) {
            throw new Error('viewer_target_changed')
          }
          if (action.kind === 'confirm' && !state.ownerAvailable) {
            throw new Error('automation_delete_owner_unavailable')
          }
          if (action.kind === 'dont-ask-again' && state.source !== 'local') {
            throw new Error('automation_delete_preference_unavailable')
          }
          if (action.kind === 'dont-ask-again' && state.dontAskAgain === action.value) {
            return state
          }
        } else if (state.open) {
          throw new Error('viewer_modal_open')
        }
        const row =
          action.kind === 'request' && action.source === 'local'
            ? current.list.filteredRows.find((item) => item.key === action.rowKey)
            : undefined
        const external =
          action.kind === 'request' && action.source === 'external'
            ? current.list.filteredExternalAutomationEntries.find(
                (item) => item.key === action.rowKey
              )
            : undefined
        if (action.kind === 'request') {
          if (!current.list.searchSettled) {
            throw new Error('viewer_busy')
          }
          if (!row && !external) {
            throw new Error('automation_row_not_visible')
          }
          if (
            (row && !current.destination.isAutomationRowActionEnabled(row, 'delete')) ||
            (external && !external.manager.canManage)
          ) {
            throw new Error('automation_delete_unavailable')
          }
        }
        return new Promise((resolve, reject) => {
          const request: Request = {
            action,
            target: automationDeletionTarget(current),
            token: latest.current.token,
            ready: false,
            mutation: action.kind === 'confirm',
            outcome: null,
            resolve,
            reject
          }
          pending.current = request
          let operation: Promise<AutomationMutationOutcome | null> | null = null
          try {
            if (action.kind === 'request') {
              outcome.current = null
              if (row) {
                operation = current.managementActions.requestDeleteAutomation(row)
                request.mutation = operation !== null
              } else if (external) {
                current.externalActions.requestExternalAction(
                  external.manager,
                  external.job,
                  'delete',
                  external.scope
                )
              }
            } else if (action.kind === 'confirm') {
              operation = current.local.deleteTarget
                ? current.managementActions.confirmDeleteAutomation()
                : current.externalActions.confirmDeleteExternalAutomation()
            } else if (action.kind === 'cancel' || action.kind === 'dismiss') {
              if (current.local.deleteTarget) {
                current.deleteDialogActions.cancelLocal()
              } else {
                current.deleteDialogActions.cancelExternal()
              }
            } else if (action.kind === 'dont-ask-again') {
              current.deleteDialogActions.togglePreference()
            } else if (action.kind === 'focus') {
              if (current.local.deleteTarget) {
                current.deleteDialogActions.focusLocal()
              } else {
                current.deleteDialogActions.focusExternal()
              }
            }
          } catch (error: unknown) {
            pending.current = null
            reject(error instanceof Error ? error : new Error('automation_delete_failed'))
            return
          }
          void Promise.resolve(operation).then(
            (result) => {
              if (pending.current !== request) {
                return
              }
              request.outcome = result
              request.ready = true
              setRevision((revision) => revision + 1)
            },
            (error: unknown) => {
              if (pending.current !== request) {
                return
              }
              pending.current = null
              reject(error instanceof Error ? error : new Error('automation_delete_failed'))
            }
          )
        })
      }
    }
    mountedDeletions.add(control)
    return () => {
      mountedDeletions.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [snapshot])
}
