import { sparsePresetChooserSnapshot } from './sparse-preset-chooser-viewer'
import type { SparsePresetViewerAction as Action } from '../../../shared/sparse-preset-viewer-command'
import type { SparsePresetViewerForm as Form } from './sparse-preset-viewer-state'
export function validateSparsePresetViewerAction(
  form: Form,
  action: Exclude<Action, { kind: 'get' }>
): void {
  if (form.disabled) {
    throw new Error('sparse_preset_disabled')
  }
  if (
    ['delete-request', 'delete-confirm', 'delete-cancel'].includes(action.kind) &&
    (form.surface !== 'settings' ||
      form.draft ||
      !form.handleDeletePreset ||
      !form.onClearDeleteConfirm)
  ) {
    throw new Error('sparse_preset_delete_unavailable')
  }
  if (
    (action.kind === 'delete-request' ||
      action.kind === 'delete-confirm' ||
      action.kind === 'delete-cancel') &&
    !form.visiblePresets.some((preset) => preset.id === action.presetId)
  ) {
    throw new Error('sparse_preset_not_visible')
  }
  if (action.kind === 'delete-request' && form.confirmingDeleteId === action.presetId) {
    throw new Error('sparse_preset_already_confirming')
  }
  if (
    (action.kind === 'delete-confirm' || action.kind === 'delete-cancel') &&
    form.confirmingDeleteId !== action.presetId
  ) {
    throw new Error('sparse_preset_confirmation_required')
  }
  if (form.surface === 'settings' && ['open', 'select', 'off'].includes(action.kind)) {
    throw new Error('sparse_preset_control_unavailable')
  }
  const chooser = sparsePresetChooserSnapshot(form.repoId, form.ownerKey)
  if (action.kind === 'chooser-query' || action.kind === 'chooser-command') {
    if (form.surface !== 'selector' || !form.open || !chooser) {
      throw new Error('sparse_preset_chooser_closed')
    }
    return
  }
  if (
    form.surface === 'selector' &&
    (action.kind === 'select' || action.kind === 'edit' || action.kind === 'off')
  ) {
    const value = action.kind === 'off' ? 'full' : `preset:${action.presetId}`
    if (!chooser?.searchSettled || !chooser.visibleValues.includes(value)) {
      throw new Error('sparse_preset_not_visible')
    }
  }
  if (action.kind === 'retry') {
    if (form.presetsLoading) {
      throw new Error('viewer_busy')
    }
    return
  }
  if (action.kind === 'open') {
    if (action.value && (form.draft || form.presetsLoading)) {
      throw new Error('sparse_preset_unavailable')
    }
    return
  }
  if (!form.presetsLoaded || form.presetsLoading) {
    throw new Error('sparse_presets_not_loaded')
  }
  if (
    ['select', 'edit', 'new', 'off'].includes(action.kind) &&
    ((form.surface === 'selector' && !form.open) || form.draft)
  ) {
    throw new Error('sparse_preset_chooser_closed')
  }
  if (
    ['draft', 'cancel', 'save', 'name-touch', 'directories-add', 'directory-remove'].includes(
      action.kind
    ) &&
    !form.draft
  ) {
    throw new Error('sparse_preset_editor_closed')
  }
  if (action.kind === 'save' && !form.canSave) {
    throw new Error('sparse_preset_draft_invalid')
  }
  if (
    (action.kind === 'edit' || action.kind === 'select') &&
    !form.visiblePresets.some((preset) => preset.id === action.presetId)
  ) {
    throw new Error('sparse_preset_not_visible')
  }
}
