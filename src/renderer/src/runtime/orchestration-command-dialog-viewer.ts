import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { OrchestrationCommandDialogAction as Action } from '../../../shared/orchestration-command-dialog-command'
type Form = {
  command: string
  open: boolean
  canOpen: boolean
  onOpenChange: (open: boolean) => void
}
type State = {
  open: boolean
  canOpen: boolean
  reviewedTarget: string
  busy: boolean
  modalOpen: boolean
}
type Control = {
  get: () => State
  apply: (action: Exclude<Action, { kind: 'get' }>) => Promise<State>
}
const mounted = new Set<Control>()
export async function applyOrchestrationCommandDialog(action: Action) {
  if (mounted.size !== 1) {
    throw new Error(mounted.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mounted.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return { commandDialog: action.kind === 'get' ? control.get() : await control.apply(action) }
}
export function useOrchestrationCommandDialogViewer(form: Form): void {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const ownerModal = useRef(modal)
  const latest = useRef({ form, profile, modal })
  const review = useRef({ scope: '', source: form.onOpenChange, token: createBrowserUuid() })
  const pending = useRef<{
    open: boolean
    reviewedTarget: string
    ready: boolean
    resolve: (state: State) => void
    reject: (error: Error) => void
  } | null>(null)
  const [, setRevision] = useState(0)
  const get = (): State => {
    const current = latest.current
    const scope = JSON.stringify([
      current.form.command,
      current.form.canOpen,
      current.profile,
      current.modal
    ])
    if (review.current.scope !== scope || review.current.source !== current.form.onOpenChange) {
      review.current = { scope, source: current.form.onOpenChange, token: createBrowserUuid() }
    }
    return {
      open: current.form.open,
      canOpen: current.form.canOpen,
      reviewedTarget: review.current.token,
      busy: Boolean(pending.current),
      modalOpen: current.modal !== ownerModal.current
    }
  }
  useLayoutEffect(() => {
    latest.current = { form, profile, modal }
    const state = get()
    const request = pending.current
    if (!request) {
      return
    }
    if (request.reviewedTarget !== state.reviewedTarget) {
      pending.current = null
      request.reject(new Error('viewer_target_changed'))
    } else if (request.ready) {
      pending.current = null
      if (state.open !== request.open) {
        request.reject(new Error('skill_command_dialog_not_committed'))
      } else {
        request.resolve({ ...state, busy: false })
      }
    }
  })
  useEffect(() => {
    const control: Control = {
      get,
      apply: async (action) => {
        const state = get()
        if (state.reviewedTarget !== action.reviewedTarget) {
          throw new Error('viewer_target_changed')
        }
        if (state.busy) {
          throw new Error('viewer_busy')
        }
        if (state.modalOpen) {
          throw new Error('viewer_modal_open')
        }
        if (action.open && !state.canOpen) {
          throw new Error('skill_command_dialog_unavailable')
        }
        if (state.open === action.open) {
          return state
        }
        const current = latest.current.form
        return new Promise<State>((resolve, reject) => {
          const request = {
            open: action.open,
            reviewedTarget: state.reviewedTarget,
            ready: false,
            resolve,
            reject
          }
          pending.current = request
          void Promise.resolve()
            .then(() => {
              if (
                !mounted.has(control) ||
                pending.current !== request ||
                get().reviewedTarget !== state.reviewedTarget
              ) {
                throw new Error('viewer_target_changed')
              }
              current.onOpenChange(action.open)
              if (pending.current === request) {
                request.ready = true
                setRevision((value) => value + 1)
              }
            })
            .catch((error: unknown) => {
              if (pending.current === request) {
                pending.current = null
                reject(error instanceof Error ? error : new Error('skill_command_dialog_failed'))
              }
            })
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
