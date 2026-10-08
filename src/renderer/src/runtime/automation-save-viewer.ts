import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { isAutomationEditorViewerBusy } from './automation-editor-viewer-controller'
import type { AutomationDraft } from '../components/automations/AutomationEditorDialog'
import type { AutomationSaveAction } from '../components/automations/automation-save-action'
import type { AutomationSaveOutcome } from '../components/automations/automation-save-outcome'

type SaveForm = {
  open: boolean
  saving: boolean
  canSave: boolean
  draft: AutomationDraft
  createTarget: string
  ownerKey: string
  onSave: AutomationSaveAction
}
type SaveCompletion = {
  requestReview: { reviewedTarget: string; reviewedDraft: string }
  outcome: AutomationSaveOutcome
  reviewStatus: 'current' | 'changed'
  closeCommitted: boolean
}
type SaveReview = {
  lastResult: SaveCompletion | null
  reviewedTarget: string
  reviewedDraft: string
  open: boolean
  saving: boolean
  canSave: boolean
  busy: boolean
}
export type AutomationSaveViewerResult = SaveReview & SaveCompletion
type SaveControl = {
  get: () => SaveReview
  save: (reviewedTarget: string, reviewedDraft: string) => Promise<AutomationSaveViewerResult>
}
type SaveRequest = {
  requestReview: { reviewedTarget: string; reviewedDraft: string }
  ownerKey: string
  ownerChanged: boolean
  draftScope: string
  outcome?: AutomationSaveOutcome
  resolve: (state: AutomationSaveViewerResult) => void
  reject: (error: Error) => void
}
const mounted = new Set<SaveControl>()
export function automationSaveReviewSnapshot(): SaveReview | null {
  return mounted.size === 1 ? (mounted.values().next().value?.get() ?? null) : null
}
export function isAutomationSaveViewerBusy(): boolean {
  return [...mounted].some((control) => control.get().busy)
}
export function applyAutomationSaveViewer(reviewedTarget: string, reviewedDraft: string) {
  if (mounted.size !== 1) {
    throw new Error(mounted.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mounted.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.save(reviewedTarget, reviewedDraft)
}

export function useAutomationSaveViewer(form: SaveForm): void {
  const scope = JSON.stringify([form.draft, form.createTarget, form.ownerKey])
  const target = useRef({ open: form.open, token: createBrowserUuid() })
  const draft = useRef({ scope, token: createBrowserUuid() })
  const latest = useRef(form)
  const lastResult = useRef<SaveCompletion | null>(null)
  const pending = useRef<SaveRequest | null>(null)
  const [, setRevision] = useState(0)
  const get = (): SaveReview => ({
    lastResult: lastResult.current,
    reviewedTarget: target.current.token,
    reviewedDraft: draft.current.token,
    open: latest.current.open,
    saving: latest.current.saving,
    canSave: latest.current.canSave,
    busy: Boolean(pending.current)
  })
  useLayoutEffect(() => {
    if (form.open && (!latest.current.open || latest.current.ownerKey !== form.ownerKey)) {
      lastResult.current = null
    }
    latest.current = form
    if (pending.current && form.open && pending.current.ownerKey !== form.ownerKey) {
      pending.current.ownerChanged = true
    }
    if (target.current.open !== form.open) {
      target.current = { open: form.open, token: createBrowserUuid() }
    }
    if (draft.current.scope !== scope) {
      draft.current = { scope, token: createBrowserUuid() }
    }
  })
  useEffect(() => {
    const request = pending.current
    if (!request?.outcome || form.saving) {
      return
    }
    const closeRequested = request.outcome.status === 'settled' && request.outcome.closeRequested
    if (closeRequested && form.open) {
      return
    }
    const completion: SaveCompletion = {
      requestReview: request.requestReview,
      outcome: request.outcome,
      reviewStatus:
        !request.ownerChanged && (closeRequested || request.draftScope === scope)
          ? 'current'
          : 'changed',
      closeCommitted: Boolean(closeRequested && !form.open)
    }
    lastResult.current = completion
    pending.current = null
    request.resolve({ ...get(), ...completion })
  })
  useEffect(() => {
    const control: SaveControl = {
      get,
      save: async (reviewedTarget, reviewedDraft) => {
        const current = latest.current
        if (pending.current || current.saving || isAutomationEditorViewerBusy()) {
          throw new Error('viewer_busy')
        }
        if (!current.open) {
          throw new Error('viewer_unavailable')
        }
        if (reviewedTarget !== target.current.token || reviewedDraft !== draft.current.token) {
          throw new Error('viewer_target_changed')
        }
        if (!current.canSave) {
          throw new Error('automation_save_unavailable')
        }
        return new Promise((resolve, reject) => {
          const request: SaveRequest = {
            requestReview: { reviewedTarget, reviewedDraft },
            ownerKey: current.ownerKey,
            ownerChanged: false,
            draftScope: draft.current.scope,
            resolve,
            reject
          }
          lastResult.current = null
          pending.current = request
          void current.onSave().then(
            (outcome) => {
              if (pending.current === request) {
                request.outcome = outcome
                setRevision((value) => value + 1)
              }
            },
            () => {
              if (pending.current === request) {
                request.outcome = { status: 'failed', write: 'unknown' }
                setRevision((value) => value + 1)
              }
            }
          )
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
