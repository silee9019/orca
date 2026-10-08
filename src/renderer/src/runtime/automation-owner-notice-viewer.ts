import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { AutomationActionNotice } from '../components/automations/automation-row-action-dispatch'
import type { AutomationHostRecoveryAction as Recovery } from '../components/automations/automation-host-status-descriptors'

type Form = {
  notice: AutomationActionNotice | null
  ownerKey: string
  onRecover: (action: Recovery) => void
  onDismiss: () => void
}
type Action = { kind: 'dismiss' } | { kind: 'recover'; action: Recovery }
export type AutomationOwnerNoticeViewerState = {
  reviewedTarget: string
  notice: AutomationActionNotice | null
  modalOpen: boolean
  busy: boolean
  completed?: { requested: Recovery | 'dismiss'; reviewStatus: 'current' | 'changed' }
}
type Control = {
  get: () => AutomationOwnerNoticeViewerState
  apply: (action: Action, reviewedTarget: string) => Promise<AutomationOwnerNoticeViewerState>
}
const mounted = new Set<Control>()
export function automationOwnerNoticeSnapshot(): AutomationOwnerNoticeViewerState | null {
  return mounted.size === 1 ? (mounted.values().next().value?.get() ?? null) : null
}
export function isAutomationOwnerNoticeBusy(): boolean {
  return [...mounted].some((control) => control.get().busy)
}
export async function applyAutomationOwnerNotice(action: Action, reviewedTarget: string) {
  if (mounted.size !== 1) {
    throw new Error(mounted.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mounted.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.apply(action, reviewedTarget)
}
export function useAutomationOwnerNoticeViewer(form: Form): void {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const latest = useRef({ ...form, profile, modal })
  const token = useRef(createBrowserUuid())
  const [, setRevision] = useState(0)
  const pending = useRef<{
    action: Action
    reviewedTarget: string
    owner: string
    profile: string | null
    resolve: (state: AutomationOwnerNoticeViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  const get = (): AutomationOwnerNoticeViewerState => ({
    reviewedTarget: token.current,
    notice: latest.current.notice,
    modalOpen: latest.current.modal !== 'none',
    busy: Boolean(pending.current)
  })
  useLayoutEffect(() => {
    const before = latest.current
    if (
      before.notice !== form.notice ||
      before.ownerKey !== form.ownerKey ||
      before.profile !== profile ||
      before.modal !== modal
    ) {
      token.current = createBrowserUuid()
    }
    latest.current = { ...form, profile, modal }
    const request = pending.current
    if (!request) {
      return
    }
    if (!form.notice) {
      pending.current = null
      request.resolve({
        ...get(),
        completed: {
          requested: request.action.kind === 'dismiss' ? 'dismiss' : request.action.action,
          reviewStatus:
            request.owner === form.ownerKey && request.profile === profile ? 'current' : 'changed'
        }
      })
    } else if (token.current !== request.reviewedTarget) {
      pending.current = null
      request.reject(new Error('viewer_target_changed'))
    }
  })
  useEffect(() => {
    const control: Control = {
      get,
      apply: async (action, reviewedTarget) => {
        const state = get()
        if (state.busy) {
          throw new Error('viewer_busy')
        }
        if (state.reviewedTarget !== reviewedTarget) {
          throw new Error('viewer_target_changed')
        }
        if (state.modalOpen) {
          throw new Error('viewer_modal_open')
        }
        if (
          !state.notice ||
          (action.kind === 'recover' && state.notice.recovery !== action.action)
        ) {
          throw new Error('automation_notice_unavailable')
        }
        return new Promise((resolve, reject) => {
          pending.current = {
            action,
            reviewedTarget,
            owner: latest.current.ownerKey,
            profile: latest.current.profile,
            resolve,
            reject
          }
          try {
            if (action.kind === 'dismiss') {
              latest.current.onDismiss()
            } else {
              latest.current.onRecover(action.action)
            }
          } catch (error) {
            pending.current = null
            reject(error instanceof Error ? error : new Error('automation_notice_recovery_failed'))
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
