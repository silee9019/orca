import { sparsePresetChooserSnapshot } from './sparse-preset-chooser-viewer'
import { sparsePresetDraftSnapshot } from './sparse-preset-draft-viewer'
import type { SparsePreset } from '../../../shared/worktree/create-types'
import type { SparsePresetDraft } from '../components/sparse/SparseCheckoutPresetDraftForm'
export type SparsePresetSaveOutcome =
  | { operation: 'blocked' | 'unconfirmed' }
  | {
      operation: 'saved'
      preset: SparsePreset
      selected: boolean
      editorClosed: boolean
      reviewStatus: 'current' | 'changed'
    }
export type SparsePresetDeleteOutcome =
  | { operation: 'blocked' }
  | { operation: 'delete-confirmation' | 'delete-unconfirmed'; presetId: string }
  | {
      operation: 'deleted'
      presetId: string
      confirmationCleared: boolean
      reviewStatus: 'current' | 'changed'
    }
export type SparsePresetViewerOutcome = SparsePresetSaveOutcome | SparsePresetDeleteOutcome
export type SparsePresetViewerForm = {
  repoId: string
  surface: 'selector' | 'settings'
  confirmingDeleteId?: string | null
  deletingPresetId?: string | null
  onClearDeleteConfirm?: () => void
  handleDeletePreset?: (preset: SparsePreset) => Promise<SparsePresetDeleteOutcome>
  ownerKey: string
  open: boolean
  draft: SparsePresetDraft | null
  submitting: boolean
  disabled: boolean
  visiblePresets: SparsePreset[]
  presetsLoaded: boolean
  presetsLoading: boolean
  presetsLoadError: string | null
  selectedPresetId: string | null
  canSave: boolean
  operationError: string | null
  handleOpenChange: (open: boolean) => void
  startNewPreset: () => void
  startEditPreset: (preset: SparsePreset) => void
  handleSaveDraft: () => Promise<SparsePresetSaveOutcome>
  handleSelectOff: () => void
  handleSelectPreset: (preset: SparsePreset) => void
  handleRetryLoadPresets: () => Promise<void>
  finishDraft: () => void
  setDraft: (draft: SparsePresetDraft | null) => void
}
export function sparsePresetReviewScope(form: SparsePresetViewerForm): string {
  return JSON.stringify([
    form.surface,
    form.open ? sparsePresetChooserSnapshot(form.repoId, form.ownerKey) : null,
    form.confirmingDeleteId,
    form.deletingPresetId,
    form.ownerKey,
    form.repoId,
    form.open,
    form.draft,
    form.disabled,
    form.visiblePresets,
    form.presetsLoaded,
    form.presetsLoading,
    form.selectedPresetId
  ])
}
export function sparsePresetSnapshot(
  form: SparsePresetViewerForm,
  reviewedTarget: string,
  busy: boolean,
  outcome: SparsePresetViewerOutcome | null,
  outcomeReviewedTarget: string | null
) {
  return {
    committed: true as const,
    repoId: form.repoId,
    surface: form.surface,
    confirmingDeleteId: form.confirmingDeleteId ?? null,
    deletingPresetId: form.deletingPresetId ?? null,
    reviewedTarget,
    open: form.open,
    draft: form.draft,
    draftControls: sparsePresetDraftSnapshot(form.repoId, form.ownerKey),
    chooser: form.open ? sparsePresetChooserSnapshot(form.repoId, form.ownerKey) : null,
    submitting: form.submitting,
    disabled: form.disabled,
    presets: form.visiblePresets,
    loaded: form.presetsLoaded,
    loading: form.presetsLoading,
    loadError: form.presetsLoadError,
    selectedPresetId: form.selectedPresetId,
    canSave: form.canSave,
    operationError: form.operationError,
    busy,
    outcome,
    outcomeReviewedTarget
  }
}
export type SparsePresetViewerState = ReturnType<typeof sparsePresetSnapshot>
