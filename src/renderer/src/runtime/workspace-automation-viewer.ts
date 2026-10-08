import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { AutomationWorkspaceProvenance } from '../../../shared/worktree/types'
import type {
  WorkspaceAutomationViewerAction as Action,
  WorkspaceAutomationNavigationTarget
} from '../../../shared/workspace-automation-viewer-command'
type Form = {
  sectionKey: string
  target?: WorkspaceAutomationNavigationTarget
  provenance: AutomationWorkspaceProvenance
  canOpenAutomation: boolean
  canOpenRun: boolean
  openAutomation?: () => void
  openRun?: () => void
}
type State = {
  sectionKey: string
  workspaceId: string | null
  automationId: string
  runId: string
  provenanceHostId: string | null
  navigationHostId: string | null
  canOpenAutomation: boolean
  canOpenRun: boolean
  reviewedTarget: string
  busy: boolean
  modalOpen: boolean
}
type Navigation = { automationId: string; runId: string | null; hostId?: string }
type OpenResult = { navigation: Navigation; activeView: 'automations'; requested: true }
type Control = {
  get: () => State
  apply: (action: Exclude<Action, { kind: 'get' }>) => Promise<OpenResult>
}
const mounted = new Set<Control>()
export async function applyWorkspaceAutomation(action: Action) {
  if (action.kind === 'get') {
    return { workspaceAutomations: [...mounted].map((control) => control.get()) }
  }
  const matches = [...mounted].filter((control) => control.get().sectionKey === action.sectionKey)
  if (matches.length !== 1) {
    throw new Error(matches.length ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = matches[0]
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.apply(action)
}
export type WorkspaceAutomationViewerResult = Awaited<ReturnType<typeof applyWorkspaceAutomation>>
export function useWorkspaceAutomationViewer(form: Form): void {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const ownerModal = useRef(modal)
  const latest = useRef({ form, profile, modal })
  const review = useRef({
    scope: '',
    automation: form.openAutomation,
    run: form.openRun,
    token: createBrowserUuid()
  })
  const pending = useRef<{
    started: boolean
    ended: boolean
    complete: () => void
    reject: (error: Error) => void
  } | null>(null)
  const get = (): State => {
    const current = latest.current
    const f = current.form
    const scope = JSON.stringify([
      f.sectionKey,
      f.target,
      f.provenance.automationId,
      f.provenance.automationRunId,
      f.provenance.hostId,
      f.canOpenAutomation,
      f.canOpenRun,
      current.profile,
      current.modal
    ])
    if (
      review.current.scope !== scope ||
      review.current.automation !== f.openAutomation ||
      review.current.run !== f.openRun
    ) {
      review.current = {
        scope,
        automation: f.openAutomation,
        run: f.openRun,
        token: createBrowserUuid()
      }
    }
    return {
      sectionKey: f.sectionKey,
      workspaceId: f.target?.workspaceId ?? null,
      automationId: f.provenance.automationId,
      runId: f.provenance.automationRunId,
      provenanceHostId: f.provenance.hostId ?? null,
      navigationHostId: f.target?.hostId ?? null,
      canOpenAutomation: Boolean(f.target && f.canOpenAutomation && f.openAutomation),
      canOpenRun: Boolean(f.target && f.canOpenRun && f.openRun),
      reviewedTarget: review.current.token,
      busy: Boolean(pending.current),
      modalOpen: current.modal !== ownerModal.current
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
        if (action.reviewedTarget !== state.reviewedTarget) {
          throw new Error('viewer_target_changed')
        }
        if (state.busy) {
          throw new Error('viewer_busy')
        }
        if (state.modalOpen) {
          throw new Error('viewer_modal_open')
        }
        const callback =
          action.kind === 'open-run'
            ? latest.current.form.openRun
            : latest.current.form.openAutomation
        if (
          !(action.kind === 'open-run' ? state.canOpenRun : state.canOpenAutomation) ||
          !callback
        ) {
          throw new Error('workspace_automation_unavailable')
        }
        const expected: Navigation = {
          automationId: state.automationId,
          runId: action.kind === 'open-run' ? state.runId : null,
          ...(state.navigationHostId ? { hostId: state.navigationHostId } : {})
        }
        const owner = { profile: latest.current.profile, modal: latest.current.modal }
        return new Promise<OpenResult>((resolve, reject) => {
          const request = {
            started: false,
            ended: false,
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
              const navigation = current.pendingAutomationRunNavigation
              if (
                current.activeOrcaProfileId !== owner.profile ||
                current.activeModal !== owner.modal
              ) {
                request.reject(new Error('viewer_target_changed'))
                return
              }
              if (
                current.activeView !== 'automations' ||
                navigation?.automationId !== expected.automationId ||
                navigation.runId !== expected.runId ||
                navigation.hostId !== expected.hostId
              ) {
                request.reject(new Error('workspace_automation_navigation_not_committed'))
                return
              }
              request.ended = true
              pending.current = null
              resolve({ navigation: expected, activeView: 'automations', requested: true })
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
              request.complete()
            })
            .catch((error: unknown) =>
              request.reject(
                error instanceof Error ? error : new Error('workspace_automation_navigation_failed')
              )
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
          if (request.started) {
            request.complete()
          } else {
            request.reject(new Error('viewer_unmounted'))
          }
        })
      }
    }
  }, [])
}
