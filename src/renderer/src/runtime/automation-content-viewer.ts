import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
type Form = {
  kind: 'prompt' | 'hermes-output'
  ownerKey: string
  content: string
  label: string
  expanded: boolean
  canToggle: boolean
  onToggle: () => void
}
export type AutomationContentViewerState = {
  kind: Form['kind']
  label: string
  reviewedTarget: string
  expanded: boolean
  canToggle: boolean
  modalOpen: boolean
  busy: boolean
}
type Control = {
  get: () => AutomationContentViewerState
  apply: (expanded: boolean, reviewedTarget: string) => Promise<AutomationContentViewerState>
}
const mounted = new Set<Control>()
export function automationContentSnapshot(): AutomationContentViewerState[] {
  return [...mounted].map((control) => control.get())
}
export function isAutomationContentBusy(): boolean {
  return [...mounted].some((control) => control.get().busy)
}
export async function applyAutomationContent(expanded: boolean, reviewedTarget: string) {
  if (mounted.size === 0) {
    throw new Error('viewer_unavailable')
  }
  const targets = [...mounted].filter((control) => control.get().reviewedTarget === reviewedTarget)
  if (targets.length !== 1) {
    throw new Error(targets.length ? 'viewer_ambiguous' : 'viewer_target_changed')
  }
  const target = targets[0]
  if (!target) {
    throw new Error('viewer_unavailable')
  }
  return target.apply(expanded, reviewedTarget)
}
export function useAutomationContentViewer(form: Form): void {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const latest = useRef({ ...form, profile, modal })
  const token = useRef(createBrowserUuid())
  const [, setRevision] = useState(0)
  const pending = useRef<{
    expanded: boolean
    ownerKey: string
    content: string
    profile: string | null
    resolve: (state: AutomationContentViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  const get = (): AutomationContentViewerState => ({
    kind: latest.current.kind,
    label: latest.current.label,
    reviewedTarget: token.current,
    expanded: latest.current.expanded,
    canToggle: latest.current.canToggle,
    modalOpen: latest.current.modal !== 'none',
    busy: Boolean(pending.current)
  })
  useLayoutEffect(() => {
    const before = latest.current
    if (
      before.ownerKey !== form.ownerKey ||
      before.content !== form.content ||
      before.kind !== form.kind ||
      before.label !== form.label ||
      before.expanded !== form.expanded ||
      before.canToggle !== form.canToggle ||
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
    pending.current = null
    if (
      request.ownerKey !== form.ownerKey ||
      request.content !== form.content ||
      request.profile !== profile ||
      modal !== 'none' ||
      form.expanded !== request.expanded
    ) {
      request.reject(new Error('viewer_target_changed'))
    } else {
      request.resolve(get())
    }
  })
  useEffect(() => {
    const control: Control = {
      get,
      apply: async (expanded, reviewedTarget) => {
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
        if (!state.canToggle) {
          throw new Error('automation_content_toggle_unavailable')
        }
        if (state.expanded === expanded) {
          return state
        }
        return new Promise((resolve, reject) => {
          pending.current = {
            expanded,
            ownerKey: latest.current.ownerKey,
            content: latest.current.content,
            profile: latest.current.profile,
            resolve,
            reject
          }
          try {
            latest.current.onToggle()
          } catch (error) {
            pending.current = null
            reject(error instanceof Error ? error : new Error('automation_content_toggle_failed'))
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
