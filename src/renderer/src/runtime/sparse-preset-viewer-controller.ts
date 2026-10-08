import {
  applySparsePresetChooserControl,
  sparsePresetChooserSnapshot,
  subscribeSparsePresetChooserMount
} from './sparse-preset-chooser-viewer'
import { validateSparsePresetViewerAction as validate } from './sparse-preset-viewer-validation'
import { applySparsePresetDraftControl } from './sparse-preset-draft-viewer'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  SparsePresetViewerRequestSchema,
  type SparsePresetViewerRequest,
  type SparsePresetViewerAction
} from '../../../shared/sparse-preset-viewer-command'
import {
  sparsePresetReviewScope,
  sparsePresetSnapshot,
  type SparsePresetViewerForm as Form,
  type SparsePresetViewerState as State,
  type SparsePresetViewerOutcome
} from './sparse-preset-viewer-state'
type Control = {
  surface: 'selector' | 'settings'
  repoId: string
  apply: (action: SparsePresetViewerAction) => Promise<State>
}
const mounted = new Set<Control>()
export async function applySparsePresetViewerAction(
  request: SparsePresetViewerRequest
): Promise<State> {
  const parsed = SparsePresetViewerRequestSchema.parse(request)
  const candidates = [...mounted].filter(
    (entry) => entry.repoId === parsed.repoId && entry.surface === (parsed.surface ?? 'selector')
  )
  if (candidates.length !== 1) {
    throw new Error(candidates.length ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  return candidates[0].apply(parsed.action)
}
type Pending = {
  action: Exclude<SparsePresetViewerAction, { kind: 'get' }>
  ownerKey: string
  ownerChanged: boolean
  ready: boolean
  outcome?: SparsePresetViewerOutcome
  resolve: (state: State) => void
  reject: (error: Error) => void
}
export function useSparsePresetViewerController(form: Form): void {
  const scope = sparsePresetReviewScope(form)
  const target = useRef({ scope, token: createBrowserUuid() })
  const latest = useRef(form)
  const pending = useRef<Pending | null>(null)
  const outcome = useRef<SparsePresetViewerOutcome | null>(null)
  const outcomeReview = useRef<string | null>(null)
  const observedOwner = useRef(form.ownerKey)
  const [, setRevision] = useState(0)
  const get = () => {
    const currentScope = sparsePresetReviewScope(latest.current)
    if (target.current.scope !== currentScope) {
      target.current = { scope: currentScope, token: createBrowserUuid() }
    }
    return sparsePresetSnapshot(
      latest.current,
      target.current.token,
      Boolean(pending.current),
      outcome.current,
      outcomeReview.current
    )
  }
  useEffect(() => subscribeSparsePresetChooserMount(() => setRevision((value) => value + 1)), [])
  useLayoutEffect(() => {
    latest.current = form
    if (observedOwner.current !== form.ownerKey) {
      observedOwner.current = form.ownerKey
      outcome.current = null
      outcomeReview.current = null
    }
    if (target.current.scope !== scope) {
      target.current = { scope, token: createBrowserUuid() }
    }
    if (pending.current && pending.current.ownerKey !== form.ownerKey) {
      pending.current.ownerChanged = true
    }
  })
  useEffect(() => {
    const request = pending.current
    if (!request?.ready) {
      return
    }
    const action = request.action
    if (
      action.kind === 'open' &&
      action.value &&
      form.presetsLoaded &&
      !sparsePresetChooserSnapshot(form.repoId, form.ownerKey)
    ) {
      return
    }
    pending.current = null
    outcomeReview.current = action.reviewedTarget
    if (action.kind === 'delete-confirm' && request.outcome?.operation === 'deleted') {
      outcome.current = {
        ...request.outcome,
        confirmationCleared: form.confirmingDeleteId !== action.presetId,
        reviewStatus: request.ownerChanged ? 'changed' : request.outcome.reviewStatus
      }
      request.resolve(get())
      return
    }
    if (action.kind === 'save' && request.outcome?.operation === 'saved') {
      const selected =
        request.outcome.selected && form.selectedPresetId === request.outcome.preset.id
      const editorClosed = request.outcome.editorClosed && form.draft === null
      const changed =
        request.ownerChanged ||
        selected !== request.outcome.selected ||
        editorClosed !== request.outcome.editorClosed
      outcome.current = {
        ...request.outcome,
        selected,
        editorClosed,
        reviewStatus: changed ? 'changed' : request.outcome.reviewStatus
      }
      request.resolve(get())
      return
    }
    if (
      request.ownerChanged ||
      (action.kind === 'delete-request' && form.confirmingDeleteId !== action.presetId) ||
      (action.kind === 'delete-cancel' && form.confirmingDeleteId !== null) ||
      (action.kind === 'open' && form.open !== action.value) ||
      (action.kind === 'select' &&
        (form.selectedPresetId !== action.presetId || form.open || form.draft)) ||
      (action.kind === 'off' && (form.selectedPresetId !== null || form.open || form.draft)) ||
      (action.kind === 'new' && (form.open || form.draft?.mode !== 'new')) ||
      (action.kind === 'edit' && (form.open || form.draft?.presetId !== action.presetId)) ||
      (action.kind === 'cancel' && form.draft !== null) ||
      (action.kind === 'draft' &&
        (form.draft?.name !== action.name || form.draft.directoriesText !== action.directoriesText))
    ) {
      request.reject(new Error('viewer_target_changed'))
    } else {
      outcome.current = request.outcome ?? null
      request.resolve(get())
    }
  })
  useEffect(() => {
    const control: Control = {
      surface: form.surface,
      repoId: form.repoId,
      apply: async (action) => {
        if (action.kind === 'get') {
          return get()
        }
        get()
        const current = latest.current
        if (pending.current || current.submitting) {
          throw new Error('viewer_busy')
        }
        if (target.current.token !== action.reviewedTarget) {
          throw new Error('viewer_target_changed')
        }
        validate(current, action)
        return new Promise((resolve, reject) => {
          const request: Pending = {
            action,
            ownerKey: current.ownerKey,
            ownerChanged: false,
            ready: true,
            resolve,
            reject
          }
          pending.current = request
          outcome.current = null
          outcomeReview.current = null
          let operation: Promise<void | SparsePresetViewerOutcome> | null = null
          try {
            switch (action.kind) {
              case 'delete-request':
              case 'delete-confirm': {
                const preset = current.visiblePresets.find((entry) => entry.id === action.presetId)
                if (preset && current.handleDeletePreset) {
                  operation = current.handleDeletePreset(preset)
                }
                break
              }
              case 'delete-cancel':
                current.onClearDeleteConfirm?.()
                break
              case 'chooser-query':
              case 'chooser-command':
                operation = applySparsePresetChooserControl(
                  current.repoId,
                  current.ownerKey,
                  action
                )
                break
              case 'name-touch':
              case 'directories-add':
              case 'directory-remove':
                operation = applySparsePresetDraftControl(current.repoId, current.ownerKey, action)
                break
              case 'open':
                current.handleOpenChange(action.value)
                break
              case 'new':
                current.startNewPreset()
                break
              case 'cancel':
                current.finishDraft()
                break
              case 'off':
                current.handleSelectOff()
                break
              case 'draft':
                if (current.draft) {
                  current.setDraft({
                    ...current.draft,
                    name: action.name,
                    directoriesText: action.directoriesText
                  })
                }
                break
              case 'select':
              case 'edit': {
                const preset = current.visiblePresets.find((entry) => entry.id === action.presetId)
                if (preset) {
                  if (action.kind === 'edit') {
                    current.startEditPreset(preset)
                  } else {
                    current.handleSelectPreset(preset)
                  }
                }
                break
              }
              case 'retry':
                operation = current.handleRetryLoadPresets()
                break
              case 'save':
                operation = current.handleSaveDraft()
                break
            }
            if (operation) {
              request.ready = false
              void operation.then(
                (result) => {
                  if (pending.current === request) {
                    request.ready = true
                    request.outcome = result ?? undefined
                    setRevision((value) => value + 1)
                  }
                },
                (error: unknown) => {
                  if (pending.current === request) {
                    pending.current = null
                    reject(
                      [
                        'name-touch',
                        'directories-add',
                        'directory-remove',
                        'chooser-query',
                        'chooser-command'
                      ].includes(action.kind) && error instanceof Error
                        ? error
                        : new Error('sparse_preset_action_failed')
                    )
                  }
                }
              )
            }
            setRevision((value) => value + 1)
          } catch (error) {
            pending.current = null
            reject(error instanceof Error ? error : new Error('sparse_preset_action_failed'))
          }
        })
      }
    }
    mounted.add(control)
    return () => {
      mounted.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [form.repoId, form.surface])
}
