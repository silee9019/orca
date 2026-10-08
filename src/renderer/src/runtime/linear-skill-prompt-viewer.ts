import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { LinearSkillPromptAction as Action } from '../../../shared/linear-skill-prompt-command'
type Form = {
  promptKey: string
  ownerKey: string
  source: () => Promise<unknown>
  open: boolean
  dismissed: boolean
  canDismiss: boolean
  canFinish: boolean
  dismiss: () => void
  finish: () => void
}
type State = Pick<Form, 'promptKey' | 'open' | 'dismissed' | 'canDismiss' | 'canFinish'> & {
  reviewedTarget: string
  busy: boolean
  modalOpen: boolean
}
type Control = {
  get: () => State
  apply: (action: Exclude<Action, { kind: 'get' }>) => Promise<State>
}
type Pending = {
  owner: string
  dismissed: boolean
  ready: boolean
  resolve: (state: State) => void
  reject: (error: Error) => void
}
const mounted = new Set<Control>()
export async function applyLinearSkillPrompt(action: Action) {
  if (action.kind === 'get') {
    return { linearPrompts: [...mounted].map((control) => control.get()) }
  }
  const matches = [...mounted].filter((control) => control.get().promptKey === action.promptKey)
  if (matches.length !== 1) {
    throw new Error(matches.length ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = matches[0]
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return { linearPrompts: [await control.apply(action)] }
}
export function useLinearSkillPromptViewer(form: Form): void {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const ownerModal = useRef(modal)
  const latest = useRef({ form, profile, modal })
  const owner = useRef({
    scope: '',
    source: form.source,
    dismiss: form.dismiss,
    finish: form.finish,
    token: createBrowserUuid()
  })
  const review = useRef({ scope: '', token: createBrowserUuid() })
  const pending = useRef<Pending | null>(null)
  const [, setRevision] = useState(0)
  const get = (): State => {
    const current = latest.current
    const f = current.form
    const scope = JSON.stringify([f.promptKey, f.ownerKey, current.profile, current.modal])
    if (
      owner.current.scope !== scope ||
      owner.current.source !== f.source ||
      owner.current.dismiss !== f.dismiss ||
      owner.current.finish !== f.finish
    ) {
      owner.current = {
        scope,
        source: f.source,
        dismiss: f.dismiss,
        finish: f.finish,
        token: createBrowserUuid()
      }
    }
    const reviewScope = JSON.stringify([
      owner.current.token,
      f.open,
      f.dismissed,
      f.canDismiss,
      f.canFinish
    ])
    if (review.current.scope !== reviewScope) {
      review.current = { scope: reviewScope, token: createBrowserUuid() }
    }
    return {
      promptKey: f.promptKey,
      open: f.open,
      dismissed: f.dismissed,
      canDismiss: f.canDismiss,
      canFinish: f.canFinish,
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
    if (request.owner !== owner.current.token) {
      pending.current = null
      request.reject(new Error('viewer_target_changed'))
    } else if (request.ready) {
      pending.current = null
      if (state.open || state.dismissed !== request.dismissed) {
        request.reject(new Error('linear_prompt_not_committed'))
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
        if (!(action.kind === 'dismiss' ? state.canDismiss : state.canFinish)) {
          throw new Error('linear_prompt_action_unavailable')
        }
        const current = latest.current.form
        return new Promise<State>((resolve, reject) => {
          const request: Pending = {
            owner: owner.current.token,
            dismissed: action.kind === 'dismiss' ? true : state.dismissed,
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
              if (action.kind === 'dismiss') {
                current.dismiss()
              } else {
                current.finish()
              }
              if (pending.current === request) {
                request.ready = true
                setRevision((value) => value + 1)
              }
            })
            .catch((error: unknown) => {
              if (pending.current === request) {
                pending.current = null
                reject(error instanceof Error ? error : new Error('linear_prompt_action_failed'))
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
