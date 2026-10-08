import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { AgentSkillSetupViewerAction as Action } from '../../../shared/agent-skill-setup-viewer-command'
type Form = {
  panelKey: string
  title: string
  ownerKey: string
  recheckOwnerKey?: string
  source: () => void | Promise<unknown>
  status?: { installed: boolean | null; loading: boolean; error: string | null }
  canRecheck?: boolean
  recheck?: () => Promise<unknown>
  copy?: { target: string; run: () => Promise<boolean> }
  terminal?: { open: boolean; attempt: number; running?: boolean; failedCode?: number | null }
  open?: (isCurrent: () => boolean) => Promise<boolean>
}
type State = {
  panelKey: string
  title: string
  installed: boolean | null
  loading: boolean | null
  error: string | null
  reviewedTarget: string
  canRecheck: boolean
  canCopy: boolean
  canOpen: boolean
  terminalOpen: boolean
  terminalAttempt: number
  setupRunning: boolean
  failedCode: number | null
  busy: boolean
  modalOpen: boolean
}
type Pending = {
  kind: Exclude<Action, { kind: 'get' }>['kind']
  reviewedTarget: string
  ownerTarget: string
  attempt: number
  ready: boolean
  cancelled: boolean
  resolve: () => void
  reject: (error: Error) => void
}
type Control = {
  get: () => State
  apply: (action: Exclude<Action, { kind: 'get' }>) => Promise<State>
}
const mounted = new Set<Control>()
export async function applyAgentSkillSetup(action: Action) {
  if (action.kind === 'get') {
    return { setupPanels: [...mounted].map((control) => control.get()) }
  }
  const matches = [...mounted].filter((control) => control.get().panelKey === action.panelKey)
  if (matches.length !== 1) {
    throw new Error(matches.length ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = matches[0]
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return { setupPanels: [await control.apply(action)] }
}
export function useAgentSkillSetupViewer(form: Form): void {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const ownerModal = useRef(modal)
  const latest = useRef({ form, profile, modal })
  const owner = useRef({
    scope: '',
    source: form.source,
    token: createBrowserUuid()
  })
  const discoveryOwner = useRef({ scope: '', source: form.source, token: createBrowserUuid() })
  const review = useRef({ scope: '', token: createBrowserUuid() })
  const pending = useRef<Pending | null>(null)
  const get = (): State => {
    const current = latest.current
    const discoveryScope = JSON.stringify([
      current.form.panelKey,
      current.form.recheckOwnerKey ?? current.form.ownerKey,
      current.profile,
      current.modal
    ])
    if (
      discoveryOwner.current.scope !== discoveryScope ||
      discoveryOwner.current.source !== current.form.source
    ) {
      discoveryOwner.current = {
        scope: discoveryScope,
        source: current.form.source,
        token: createBrowserUuid()
      }
    }
    const ownerScope = JSON.stringify([
      current.form.panelKey,
      current.form.ownerKey,
      current.profile,
      current.modal
    ])
    if (owner.current.scope !== ownerScope || owner.current.source !== current.form.source) {
      owner.current = {
        scope: ownerScope,
        source: current.form.source,
        token: createBrowserUuid()
      }
    }
    const scope = JSON.stringify([owner.current.token, current.form.copy?.target])
    if (review.current.scope !== scope) {
      review.current = { scope, token: createBrowserUuid() }
    }
    return {
      panelKey: current.form.panelKey,
      title: current.form.title,
      ...(current.form.status ?? { installed: null, loading: null, error: null }),
      reviewedTarget: review.current.token,
      canRecheck: Boolean(current.form.canRecheck && current.form.recheck),
      canCopy: Boolean(current.form.copy),
      canOpen: Boolean(current.form.open),
      terminalOpen: current.form.terminal?.open ?? false,
      terminalAttempt: current.form.terminal?.attempt ?? 0,
      setupRunning: current.form.terminal?.running ?? false,
      failedCode: current.form.terminal?.failedCode ?? null,
      busy: Boolean(pending.current),
      modalOpen: current.modal !== ownerModal.current
    }
  }
  const targetOwner = (kind: Pending['kind']) =>
    kind === 'recheck' ? discoveryOwner.current.token : owner.current.token
  const settle = (request: Pending): boolean => {
    const state = get()
    if (request.cancelled || pending.current !== request) {
      return false
    }
    if (
      request.ownerTarget !== targetOwner(request.kind) ||
      (request.kind === 'copy-command' && request.reviewedTarget !== state.reviewedTarget) ||
      (request.kind === 'open-terminal' && state.terminalAttempt > request.attempt + 1)
    ) {
      request.reject(new Error('viewer_target_changed'))
      return false
    }
    if (
      request.kind === 'open-terminal' &&
      request.ready &&
      state.terminalOpen &&
      state.terminalAttempt === request.attempt + 1
    ) {
      request.resolve()
    } else if (
      request.kind === 'open-terminal' &&
      request.ready &&
      state.terminalAttempt === request.attempt + 1 &&
      !state.terminalOpen
    ) {
      request.reject(new Error('skill_setup_open_not_committed'))
      return false
    }
    return true
  }
  useLayoutEffect(() => {
    latest.current = { form, profile, modal }
    get()
    if (pending.current) {
      settle(pending.current)
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
        const available =
          action.kind === 'recheck'
            ? state.canRecheck
            : action.kind === 'copy-command'
              ? state.canCopy
              : state.canOpen
        if (!available) {
          throw new Error(`skill_setup_${action.kind}_unavailable`)
        }
        const current = latest.current.form
        const ownerTarget = targetOwner(action.kind)
        try {
          await new Promise<void>((resolve, reject) => {
            const request: Pending = {
              kind: action.kind,
              reviewedTarget: state.reviewedTarget,
              ownerTarget,
              attempt: state.terminalAttempt,
              ready: false,
              cancelled: false,
              resolve,
              reject: (error) => {
                request.cancelled = true
                reject(error)
              }
            }
            pending.current = request
            const isCurrent = () => mounted.has(control) && settle(request)
            void Promise.resolve()
              .then(async () => {
                if (!isCurrent()) {
                  throw new Error('viewer_target_changed')
                }
                if (action.kind === 'recheck') {
                  if (!current.recheck) {
                    throw new Error('skill_setup_recheck_unavailable')
                  }
                  await current.recheck()
                } else if (action.kind === 'copy-command') {
                  if (!current.copy || !(await current.copy.run())) {
                    throw new Error('skill_setup_copy_failed')
                  }
                } else if (!current.open || !(await current.open(isCurrent))) {
                  throw new Error('skill_setup_open_failed')
                }
                request.ready = true
                if (isCurrent() && action.kind !== 'open-terminal') {
                  resolve()
                }
              })
              .catch(request.reject)
          })
          const final = get()
          if (
            !mounted.has(control) ||
            targetOwner(action.kind) !== ownerTarget ||
            (action.kind === 'copy-command' && final.reviewedTarget !== state.reviewedTarget)
          ) {
            throw new Error('viewer_target_changed')
          }
          if (
            action.kind === 'open-terminal' &&
            (!final.terminalOpen || final.terminalAttempt !== state.terminalAttempt + 1)
          ) {
            throw new Error('skill_setup_open_not_committed')
          }
          return { ...final, busy: false }
        } finally {
          pending.current = null
        }
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
