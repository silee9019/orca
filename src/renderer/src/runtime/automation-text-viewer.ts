import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { AutomationTextViewerAction as Action } from '../../../shared/automation-text-viewer-command'
type Form = { ownerKey: string; focusName: () => boolean }
export type AutomationTextViewerState = {
  reviewedTarget: string
  modalOpen: boolean
  busy: boolean
}
type Control = {
  get: () => AutomationTextViewerState
  apply: (action: Action) => Promise<AutomationTextViewerState>
}
const mounted = new Set<Control>()
export function automationTextSnapshot(): AutomationTextViewerState | null {
  return mounted.size === 1 ? (mounted.values().next().value?.get() ?? null) : null
}
export async function applyAutomationText(action: Action): Promise<AutomationTextViewerState> {
  if (mounted.size !== 1) {
    throw new Error(mounted.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mounted.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.apply(action)
}
export function useAutomationTextViewer(form: Form): void {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const latest = useRef({ form, profile, modal })
  const review = useRef({ scope: '', token: createBrowserUuid() })
  const busy = useRef(false)
  const get = (): AutomationTextViewerState => {
    const current = latest.current
    const scope = JSON.stringify([current.form.ownerKey, current.profile, current.modal])
    if (review.current.scope !== scope) {
      review.current = { scope, token: createBrowserUuid() }
    }
    return {
      reviewedTarget: review.current.token,
      modalOpen: current.modal !== 'none',
      busy: busy.current
    }
  }
  useLayoutEffect(() => {
    latest.current = { form, profile, modal }
    get()
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
        busy.current = true
        try {
          if (!latest.current.form.focusName()) {
            throw new Error('automation_name_focus_unavailable')
          }
          if (!mounted.has(control) || get().reviewedTarget !== state.reviewedTarget) {
            throw new Error('viewer_target_changed')
          }
          return { ...get(), busy: false }
        } finally {
          busy.current = false
        }
      }
    }
    mounted.add(control)
    return () => {
      mounted.delete(control)
    }
  }, [])
}
