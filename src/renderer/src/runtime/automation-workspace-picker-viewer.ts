import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { AutomationWorkspacePickerAction as Action } from '../../../shared/automation-workspace-picker-command'
type Form = {
  workspaceIds: string[]
  ownerKey: string
  value: string
  open: boolean
  onOpenChange: (open: boolean) => void
  focusSearch: () => void
  searchFocused: () => boolean
  onSelect: (workspaceId: string) => void
}
export type AutomationWorkspacePickerState = {
  reviewedTarget: string
  workspaceIds: string[]
  value: string
  open: boolean
  searchFocused: boolean
  busy: boolean
  modalOpen: boolean
}
type Control = {
  get: () => AutomationWorkspacePickerState
  apply: (action: Action) => Promise<AutomationWorkspacePickerState>
}
type Pending = {
  action: Exclude<Action, { kind: 'get' }>
  ownerScope: string
  ready: boolean
  invalidated: boolean
  frame?: number
  resolve: (state: AutomationWorkspacePickerState) => void
  reject: (error: Error) => void
}
const mounted = new Set<Control>()
export function automationWorkspacePickerSnapshot(): AutomationWorkspacePickerState | null {
  return mounted.size === 1 ? (mounted.values().next().value?.get() ?? null) : null
}
export async function applyAutomationWorkspacePicker(action: Action) {
  if (mounted.size !== 1) {
    throw new Error(mounted.size ? 'viewer_ambiguous' : 'automation_workspace_picker_unavailable')
  }
  const control = mounted.values().next().value
  if (!control) {
    throw new Error('automation_workspace_picker_unavailable')
  }
  return control.apply(action)
}
export function useAutomationWorkspacePickerViewer(form: Form): void {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const latest = useRef({ ...form, profile, modal })
  const review = useRef({ scope: '', token: createBrowserUuid() })
  const [, setRevision] = useState(0)
  const pending = useRef<Pending | null>(null)
  const ownerScope = (): string =>
    JSON.stringify([
      latest.current.ownerKey,
      latest.current.workspaceIds,
      latest.current.profile,
      latest.current.modal
    ])
  const get = (): AutomationWorkspacePickerState => {
    const current = latest.current
    const scope = JSON.stringify([ownerScope(), current.value, current.open])
    if (review.current.scope !== scope) {
      review.current = { scope, token: createBrowserUuid() }
    }
    return {
      reviewedTarget: review.current.token,
      workspaceIds: current.workspaceIds,
      value: current.value,
      open: current.open,
      searchFocused: current.searchFocused(),
      busy: Boolean(pending.current),
      modalOpen: current.modal !== 'none'
    }
  }
  useLayoutEffect(() => {
    latest.current = { ...form, profile, modal }
    get()
    const request = pending.current
    if (
      request &&
      (request.ownerScope !== ownerScope() || (request.action.kind === 'focus' && !form.open))
    ) {
      request.invalidated = true
    }
    if (!request?.ready) {
      return
    }
    pending.current = null
    const state = get()
    const action = request.action
    if (
      request.invalidated ||
      request.ownerScope !== ownerScope() ||
      (action.kind === 'open' && state.open !== action.value) ||
      (action.kind === 'focus' && (!state.open || !state.searchFocused)) ||
      (action.kind === 'select' && (state.value !== action.workspaceId || state.open))
    ) {
      request.reject(new Error('viewer_target_changed'))
    } else {
      request.resolve(state)
    }
  })
  useEffect(() => {
    const control: Control = {
      get,
      apply: async (action) => {
        const state = get()
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
        if (action.kind === 'focus' && !state.open) {
          throw new Error('automation_workspace_picker_closed')
        }
        if (action.kind === 'select' && !state.workspaceIds.includes(action.workspaceId)) {
          throw new Error('automation_workspace_unavailable')
        }
        return new Promise((resolve, reject) => {
          const request: Pending = {
            action,
            ownerScope: ownerScope(),
            ready: action.kind !== 'focus',
            invalidated: false,
            resolve,
            reject
          }
          pending.current = request
          try {
            if (action.kind === 'open') {
              latest.current.onOpenChange(action.value)
            } else if (action.kind === 'select') {
              latest.current.onSelect(action.workspaceId)
            } else {
              latest.current.focusSearch()
              request.frame = requestAnimationFrame(() => {
                if (pending.current !== request) {
                  return
                }
                request.ready = true
                setRevision((value) => value + 1)
              })
            }
          } catch (error) {
            pending.current = null
            reject(error instanceof Error ? error : new Error('automation_workspace_picker_failed'))
          }
          setRevision((value) => value + 1)
        })
      }
    }
    mounted.add(control)
    return () => {
      mounted.delete(control)
      if (pending.current?.frame !== undefined) {
        cancelAnimationFrame(pending.current.frame)
      }
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
}
