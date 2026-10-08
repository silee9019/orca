import type { AutomationActionNotice } from '../components/automations/automation-row-action-dispatch'
import type { AutomationHostRecoveryAction as Recovery } from '../components/automations/automation-host-status-descriptors'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { AutomationRun } from '../../../shared/automations-types'

type Form = {
  ownerKey: string | null
  automationId: string
  runs: AutomationRun[]
  selectedRunId: string | null
  unavailable: boolean
  notice?: AutomationActionNotice | null
  onRecover?: (action: Recovery) => void
  onSelect: (run: AutomationRun) => void
}
export type AutomationHistoryViewerState = {
  automationId: string
  reviewedTarget: string
  runIds: string[]
  selectedRunId: string | null
  unavailable: boolean
  modalOpen: boolean
  ownerQualified: boolean
  recovery: Recovery | null
  busy: boolean
  closed: boolean
  completed?: { recoveryRequested: Recovery }
}
type Control = {
  recover: (action: Recovery, reviewedTarget: string) => Promise<AutomationHistoryViewerState>
  get: () => AutomationHistoryViewerState
  prepare: (
    runId: string,
    reviewedTarget: string
  ) => { automationId: string; runId: string; open: () => void }
}
const mounted = new Set<Control>()
export function automationHistoryViewerSnapshot(): AutomationHistoryViewerState | null {
  return mounted.size === 1 ? (mounted.values().next().value?.get() ?? null) : null
}
export function isAutomationHistoryViewerBusy(): boolean {
  return [...mounted].some((entry) => entry.get().busy)
}
export async function applyAutomationHistoryRecovery(action: Recovery, reviewedTarget: string) {
  if (mounted.size !== 1) {
    throw new Error(mounted.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mounted.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.recover(action, reviewedTarget)
}
export function prepareAutomationHistoryViewerOpen(runId: string, reviewedTarget: string) {
  if (mounted.size !== 1) {
    throw new Error(mounted.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mounted.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.prepare(runId, reviewedTarget)
}
export function useAutomationHistoryViewer(form: Form): void {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const latest = useRef({ ...form, profile, modal })
  const pending = useRef<{
    action: Recovery
    owner: string | null
    profile: string | null
    before: AutomationHistoryViewerState
    invalidated: boolean
    ready: boolean
    resolve: (state: AutomationHistoryViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  const [, setRevision] = useState(0)
  const review = useRef({ scope: '', token: createBrowserUuid() })
  const noticeIdentity = useRef(form.notice)
  const get = (): AutomationHistoryViewerState => {
    const current = latest.current
    const scope = JSON.stringify([
      current.ownerKey,
      current.profile,
      current.modal,
      current.automationId,
      current.selectedRunId,
      current.unavailable,
      current.notice,
      current.runs.map((run) => run.id)
    ])
    if (review.current.scope !== scope) {
      review.current = { scope, token: createBrowserUuid() }
    }
    return {
      automationId: current.automationId,
      reviewedTarget: review.current.token,
      runIds: current.runs.map((run) => run.id),
      selectedRunId: current.selectedRunId,
      unavailable: current.unavailable,
      modalOpen: current.modal !== 'none',
      ownerQualified: current.ownerKey !== null,
      recovery: current.notice?.recovery ?? null,
      busy: Boolean(pending.current),
      closed: false
    }
  }
  useLayoutEffect(() => {
    latest.current = { ...form, profile, modal }
    if (noticeIdentity.current !== form.notice) {
      noticeIdentity.current = form.notice
      review.current.scope = ''
    }
    if (
      pending.current &&
      (pending.current.owner !== form.ownerKey || pending.current.profile !== profile)
    ) {
      pending.current.invalidated = true
    }
    get()
  })
  useEffect(() => {
    const request = pending.current
    if (!request?.ready) {
      return
    }
    pending.current = null
    if (request.invalidated) {
      request.reject(new Error('viewer_target_changed'))
    } else {
      request.resolve({ ...get(), busy: false, completed: { recoveryRequested: request.action } })
    }
  })
  useEffect(() => {
    const control: Control = {
      get,
      recover: async (action, reviewedTarget) => {
        const state = get()
        if (state.busy) {
          throw new Error('viewer_busy')
        }
        if (!state.ownerQualified) {
          throw new Error('viewer_unavailable')
        }
        if (state.reviewedTarget !== reviewedTarget) {
          throw new Error('viewer_target_changed')
        }
        if (state.modalOpen) {
          throw new Error('viewer_modal_open')
        }
        const onRecover = latest.current.onRecover
        if (!state.unavailable || state.recovery !== action || !onRecover) {
          throw new Error('automation_history_recovery_unavailable')
        }
        return new Promise((resolve, reject) => {
          const request = {
            action,
            owner: latest.current.ownerKey,
            profile: latest.current.profile,
            before: state,
            invalidated: false,
            ready: false,
            resolve,
            reject
          }
          pending.current = request
          try {
            onRecover(action)
            request.ready = true
          } catch (error) {
            pending.current = null
            reject(error instanceof Error ? error : new Error('automation_history_recovery_failed'))
          }
          setRevision((value) => value + 1)
        })
      },
      prepare: (runId, reviewedTarget) => {
        const state = get()
        if (state.busy) {
          throw new Error('viewer_busy')
        }
        if (!state.ownerQualified) {
          throw new Error('viewer_unavailable')
        }
        if (state.reviewedTarget !== reviewedTarget) {
          throw new Error('viewer_target_changed')
        }
        if (state.modalOpen) {
          throw new Error('viewer_modal_open')
        }
        const run = latest.current.runs.find((run) => run.id === runId)
        if (state.unavailable || !run) {
          throw new Error('automation_run_not_visible')
        }
        const onSelect = latest.current.onSelect
        return { automationId: state.automationId, runId, open: () => onSelect(run) }
      }
    }
    mounted.add(control)
    return () => {
      mounted.delete(control)
      const request = pending.current
      pending.current = null
      if (request?.ready && !request.invalidated) {
        request.resolve({
          ...request.before,
          busy: false,
          closed: true,
          completed: { recoveryRequested: request.action }
        })
      } else {
        request?.reject(
          new Error(request.invalidated ? 'viewer_target_changed' : 'viewer_unmounted')
        )
      }
    }
  }, [])
}
