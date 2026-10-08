import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { LINEAR_INTEGRATION_SECTION_ID } from '../components/settings/task-provider-integration-section-ids'
import type { LinearAccessViewerAction as Action } from '../../../shared/linear-access-viewer-command'

type Form = {
  paneKey: string
  ownerKey: string
  connected: boolean
  keyDialogOpen: boolean
  openTaskSources: () => void
  manageAccess: () => void
  openIntegrations: () => void
  closeAccessDialog: () => void
}
type State = Pick<Form, 'paneKey' | 'connected' | 'keyDialogOpen'> & {
  reviewedTarget: string
  busy: boolean
  modalOpen: boolean
}
type Result = State & {
  requested?: true
  destination?: 'tasks' | 'integrations' | 'key-dialog' | 'closed'
}
type Control = {
  get: () => State
  apply: (action: Exclude<Action, { kind: 'get' }>) => Promise<Result>
}
const mounted = new Set<Control>()
export async function applyLinearAccess(action: Action) {
  if (action.kind === 'get') {
    return { linearAccessPanes: [...mounted].map((control) => control.get()) }
  }
  const matches = [...mounted].filter((control) => control.get().paneKey === action.paneKey)
  const control = matches[0]
  if (matches.length !== 1 || !control) {
    throw new Error(matches.length ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  return { linearAccessPanes: [await control.apply(action)] }
}
export function LinearAccessViewer(form: Form): null {
  useLinearAccessViewer(form)
  return null
}
export function useLinearAccessViewer(form: Form): void {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const ownerModal = useRef(modal)
  const latest = useRef({ form, profile, modal })
  const review = useRef({
    scope: '',
    callbacks: [
      form.openTaskSources,
      form.manageAccess,
      form.openIntegrations,
      form.closeAccessDialog
    ],
    token: createBrowserUuid()
  })
  const pending = useRef<{
    started: boolean
    ended: boolean
    navigation: boolean
    complete: () => void
    reject: (error: Error) => void
  } | null>(null)
  const [, setRevision] = useState(0)
  const get = (): State => {
    const current = latest.current
    const f = current.form
    const scope = JSON.stringify([
      f.paneKey,
      f.ownerKey,
      f.connected,
      f.keyDialogOpen,
      current.profile,
      current.modal
    ])
    const callbacks = [f.openTaskSources, f.manageAccess, f.openIntegrations, f.closeAccessDialog]
    if (
      review.current.scope !== scope ||
      callbacks.some((callback, i) => callback !== review.current.callbacks[i])
    ) {
      review.current = { scope, callbacks, token: createBrowserUuid() }
    }
    return {
      paneKey: f.paneKey,
      connected: f.connected,
      keyDialogOpen: f.keyDialogOpen,
      reviewedTarget: review.current.token,
      busy: Boolean(pending.current),
      modalOpen: current.modal !== ownerModal.current
    }
  }
  useLayoutEffect(() => {
    latest.current = { form, profile, modal }
    get()
    const request = pending.current
    if (request?.started && !request.navigation) {
      request.complete()
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
        const closing = action.kind === 'close-access-dialog'
        if (state.modalOpen || (state.keyDialogOpen && !closing)) {
          throw new Error('viewer_modal_open')
        }
        if (closing && !state.keyDialogOpen) {
          throw new Error('linear_access_dialog_not_open')
        }
        const owner = latest.current
        const destination = closing
          ? 'closed'
          : action.kind === 'open-task-sources'
            ? 'tasks'
            : action.kind === 'manage-access' && !state.connected
              ? 'key-dialog'
              : 'integrations'
        const callback = {
          'open-task-sources': owner.form.openTaskSources,
          'manage-access': owner.form.manageAccess,
          'open-integrations': owner.form.openIntegrations,
          'close-access-dialog': owner.form.closeAccessDialog
        }[action.kind]
        return new Promise<Result>((resolve, reject) => {
          const request = {
            started: false,
            ended: false,
            navigation: destination === 'tasks' || destination === 'integrations',
            reject: (error: Error) => {
              if (!request.ended) {
                request.ended = true
                pending.current = null
                reject(error)
              }
            },
            complete: () => {
              if (request.ended) {
                return
              }
              const current = useAppStore.getState()
              if (
                current.activeOrcaProfileId !== owner.profile ||
                current.activeModal !== owner.modal ||
                getProviderRuntimeContextKey(current.settings) !== owner.form.ownerKey
              ) {
                request.reject(new Error('viewer_target_changed'))
                return
              }
              const target = current.settingsNavigationTarget
              const dialog = latest.current.form
              const committed =
                destination === 'key-dialog'
                  ? dialog.keyDialogOpen &&
                    dialog.ownerKey === owner.form.ownerKey &&
                    dialog.connected === owner.form.connected
                  : destination === 'closed'
                    ? !dialog.keyDialogOpen && dialog.ownerKey === owner.form.ownerKey
                    : current.activeView === 'settings' &&
                      target?.pane === destination &&
                      target.repoId === null &&
                      (destination !== 'integrations' ||
                        target.sectionId === LINEAR_INTEGRATION_SECTION_ID)
              if (!committed) {
                request.reject(new Error('linear_access_not_committed'))
                return
              }
              request.ended = true
              pending.current = null
              resolve({ ...get(), busy: false, requested: true, destination })
            }
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
              request.started = true
              callback()
              if (request.navigation) {
                request.complete()
              } else {
                setRevision((value) => value + 1)
              }
            })
            .catch((error: unknown) =>
              request.reject(error instanceof Error ? error : new Error('linear_access_failed'))
            )
        })
      }
    }
    mounted.add(control)
    return () => {
      mounted.delete(control)
      const request = pending.current
      if (request) {
        void Promise.resolve().then(() => {
          if (request.started && request.navigation) {
            request.complete()
          } else {
            request.reject(new Error('viewer_unmounted'))
          }
        })
      }
    }
  }, [])
}
