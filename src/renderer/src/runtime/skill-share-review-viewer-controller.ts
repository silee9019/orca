import { useEffect, useLayoutEffect, useRef } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  SkillShareReviewViewerActionSchema,
  type SkillShareReviewViewerAction
} from '../../../shared/skill-share-review-viewer-command'

type Form = {
  preparationId: string
  descriptionAvailable: boolean
  filesAvailable: boolean
  skillsAvailable: boolean
  descriptionExpanded: boolean
  filesOpen: boolean
  skillsOpen: boolean
  setDescriptionExpanded: (value: boolean) => void
  setFilesOpen: (value: boolean) => void
  setSkillsOpen: (value: boolean) => void
}
function snapshot(form: Form, reviewedTarget: string) {
  return {
    reviewedTarget,
    preparationId: form.preparationId,
    description: { available: form.descriptionAvailable, expanded: form.descriptionExpanded },
    files: { available: form.filesAvailable, open: form.filesOpen },
    skills: { available: form.skillsAvailable, open: form.skillsOpen }
  }
}
export type SkillShareReviewViewerState = ReturnType<typeof snapshot>
type Control = {
  get: () => SkillShareReviewViewerState
  apply: (action: SkillShareReviewViewerAction) => Promise<SkillShareReviewViewerState>
}
const mountedReviews = new Set<Control>()
export function skillShareReviewViewerSnapshot(preparationId: string | undefined) {
  if (mountedReviews.size !== 1) {
    return null
  }
  const state = mountedReviews.values().next().value?.get()
  return state?.preparationId === preparationId ? state : null
}
export async function applySkillShareReviewViewerAction(action: SkillShareReviewViewerAction) {
  const parsed = SkillShareReviewViewerActionSchema.parse(action)
  if (mountedReviews.size !== 1) {
    throw new Error(mountedReviews.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedReviews.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.apply(parsed)
}
export function useSkillShareReviewViewerController(form: Form): void {
  const scope = JSON.stringify([
    form.preparationId,
    form.descriptionAvailable,
    form.filesAvailable,
    form.skillsAvailable
  ])
  const target = useRef({ scope, token: createBrowserUuid() })
  const latest = useRef({ form, reviewedTarget: target.current.token })
  type Request = {
    action: Exclude<SkillShareReviewViewerAction, { kind: 'get' }>
    resolve: (value: SkillShareReviewViewerState) => void
    reject: (error: Error) => void
  }
  const pending = useRef<Request | null>(null)
  useLayoutEffect(() => {
    if (target.current.scope !== scope) {
      target.current = { scope, token: createBrowserUuid() }
    }
    const reviewedTarget = target.current.token
    latest.current = { form, reviewedTarget }
    const request = pending.current
    if (!request) {
      return
    }
    if (request.action.reviewedTarget !== reviewedTarget) {
      pending.current = null
      request.reject(new Error('viewer_target_changed'))
      return
    }
    const action = request.action
    const committed =
      action.kind === 'description'
        ? form.descriptionExpanded === action.expanded
        : action.kind === 'files'
          ? form.filesOpen === action.open
          : form.skillsOpen === action.open
    if (committed) {
      pending.current = null
      request.resolve(snapshot(form, reviewedTarget))
    }
  })
  useEffect(() => {
    const control: Control = {
      get: () => snapshot(latest.current.form, latest.current.reviewedTarget),
      apply: async (action) => {
        const current = latest.current
        if (action.kind === 'get') {
          return snapshot(current.form, current.reviewedTarget)
        }
        if (pending.current) {
          throw new Error('viewer_busy')
        }
        if (action.reviewedTarget !== current.reviewedTarget) {
          throw new Error('viewer_target_changed')
        }
        const available =
          action.kind === 'description'
            ? current.form.descriptionAvailable
            : action.kind === 'files'
              ? current.form.filesAvailable
              : current.form.skillsAvailable
        if (!available) {
          throw new Error('skill_share_review_unavailable')
        }
        const committed =
          action.kind === 'description'
            ? current.form.descriptionExpanded === action.expanded
            : action.kind === 'files'
              ? current.form.filesOpen === action.open
              : current.form.skillsOpen === action.open
        if (committed) {
          return snapshot(current.form, current.reviewedTarget)
        }
        return new Promise((resolve, reject) => {
          pending.current = { action, resolve, reject }
          if (action.kind === 'description') {
            current.form.setDescriptionExpanded(action.expanded)
          } else if (action.kind === 'files') {
            current.form.setFilesOpen(action.open)
          } else {
            current.form.setSkillsOpen(action.open)
          }
        })
      }
    }
    mountedReviews.add(control)
    return () => {
      mountedReviews.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
}
