import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SparsePreset } from '../../../../shared/worktree/create-types'
import { useAppStore } from '../../store'
import { parseSparsePresetDirectories, validateSparsePresetName } from '@/lib/sparse-preset-draft'
import { useMountedRef } from '@/hooks/useMountedRef'
import { getSparsePresetOperationErrorMessage } from './sparse-preset-operation-error'
import type { SparsePresetDraft } from './sparse-preset-draft-editor'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { useSparsePresetViewerController } from '../../runtime/sparse-preset-viewer-controller'
import type {
  SparsePresetSaveOutcome,
  SparsePresetDeleteOutcome
} from '../../runtime/sparse-preset-viewer-state'

export function useSparsePresetSettings(repoId: string) {
  const repo = useAppStore((s) => s.repos.find((entry) => entry.id === repoId))
  const profileId = useAppStore((state) => state.activeOrcaProfileId)
  const ownerKey = JSON.stringify([
    'settings',
    profileId,
    repo?.id,
    repo?.path,
    repo ? getRepoExecutionHostId(repo) : null
  ])
  const owner = useRef({ key: ownerKey, revision: 0 })
  useLayoutEffect(() => {
    if (owner.current.key !== ownerKey) {
      owner.current = { key: ownerKey, revision: owner.current.revision + 1 }
    }
  }, [ownerKey])
  const presets = useAppStore((s) => s.sparsePresetsByRepo[repoId])
  const loadStatus = useAppStore((s) => s.sparsePresetsLoadStatusByRepo[repoId] ?? 'idle')
  const loadError = useAppStore((s) => s.sparsePresetsErrorByRepo[repoId])
  const fetchSparsePresets = useAppStore((s) => s.fetchSparsePresets)
  const saveSparsePreset = useAppStore((s) => s.saveSparsePreset)
  const removeSparsePreset = useAppStore((s) => s.removeSparsePreset)

  const [draft, setDraft] = useState<SparsePresetDraft | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const mountedRef = useMountedRef()
  const sectionRef = useRef<HTMLElement | null>(null)
  const returnPresetIdRef = useRef<string | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const closeDraft = (): void => {
    setDraft(null)
    setOperationError(null)
    requestAnimationFrame(() => {
      if (!mountedRef.current) {
        return
      }
      if (returnPresetIdRef.current) {
        sectionRef.current
          ?.querySelector<HTMLButtonElement>(
            `[data-edit-preset="${CSS.escape(returnPresetIdRef.current)}"]`
          )
          ?.focus()
      } else if (returnFocusRef.current?.isConnected) {
        returnFocusRef.current.focus()
      }
    })
  }
  const rememberEditorTrigger = (): void => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
  }

  useEffect(() => {
    if (presets === undefined && loadStatus === 'idle') {
      void fetchSparsePresets(repoId).catch((error: unknown) => {
        if (mountedRef.current) {
          setOperationError(
            getSparsePresetOperationErrorMessage(error, 'Failed to load sparse presets.')
          )
        }
      })
    }
  }, [fetchSparsePresets, loadStatus, mountedRef, presets, repoId])

  const sortedPresets = presets ?? []
  const parsedDirectories = draft ? parseSparsePresetDirectories(draft.directoriesText) : null
  const trimmedName = draft?.name.trim() ?? ''
  const nameError = draft
    ? validateSparsePresetName(draft.name, sortedPresets, draft.presetId)
    : null
  const canSaveDraft =
    !!draft &&
    presets !== undefined &&
    !submitting &&
    !nameError &&
    parsedDirectories !== null &&
    !parsedDirectories.error
  const visibleError = (draft ? null : operationError) ?? loadError ?? null

  const startNewPreset = (): void => {
    if (draft || presets === undefined || deletingPresetId) {
      return
    }
    rememberEditorTrigger()
    setConfirmingDeleteId(null)
    setOperationError(null)
    returnPresetIdRef.current = null
    setDraft({
      mode: 'new',
      name: '',
      directoriesText: ''
    })
  }

  const startEditPreset = (preset: SparsePreset): void => {
    if (draft || presets === undefined || deletingPresetId) {
      return
    }
    rememberEditorTrigger()
    setConfirmingDeleteId(null)
    setOperationError(null)
    returnPresetIdRef.current = preset.id
    setDraft({
      mode: 'edit',
      presetId: preset.id,
      name: preset.name,
      directoriesText: preset.directories.join('\n')
    })
  }

  const handleSaveDraft = async (): Promise<SparsePresetSaveOutcome> => {
    if (!draft || !canSaveDraft || !parsedDirectories) {
      return { operation: 'blocked' }
    }
    const revision = owner.current.revision
    let acknowledgement: SparsePresetSaveOutcome = { operation: 'unconfirmed' }
    setSubmitting(true)
    setOperationError(null)
    try {
      const saved = await saveSparsePreset({
        repoId,
        id: draft.presetId,
        name: trimmedName,
        directories: parsedDirectories.directories
      })
      if (saved) {
        acknowledgement = {
          operation: 'saved',
          preset: saved,
          selected: false,
          editorClosed: false,
          reviewStatus: owner.current.revision === revision ? 'current' : 'changed'
        }
      }
      if (saved && mountedRef.current && owner.current.revision === revision) {
        closeDraft()
        return {
          operation: 'saved',
          preset: saved,
          selected: false,
          editorClosed: true,
          reviewStatus: 'current'
        }
      } else if (mountedRef.current && owner.current.revision === revision) {
        setOperationError(
          draft.mode === 'new' ? 'Failed to save preset.' : 'Failed to update preset.'
        )
      }
      return acknowledgement
    } catch (error) {
      if (mountedRef.current && owner.current.revision === revision) {
        setOperationError(
          getSparsePresetOperationErrorMessage(
            error,
            draft.mode === 'new' ? 'Failed to save preset.' : 'Failed to update preset.'
          )
        )
      }
      return acknowledgement
    } finally {
      if (mountedRef.current) {
        setSubmitting(false)
      }
    }
  }

  const handleDeletePreset = async (preset: SparsePreset): Promise<SparsePresetDeleteOutcome> => {
    if (draft || deletingPresetId) {
      return { operation: 'blocked' }
    }
    if (confirmingDeleteId !== preset.id) {
      setConfirmingDeleteId(preset.id)
      return { operation: 'delete-confirmation', presetId: preset.id }
    }
    const revision = owner.current.revision
    setDeletingPresetId(preset.id)
    setOperationError(null)
    try {
      // Why: SSH-backed settings can fail after confirmation; keep local edit
      // state intact until persistence actually reports success.
      await removeSparsePreset({ repoId, presetId: preset.id })
      if (mountedRef.current && owner.current.revision === revision) {
        setConfirmingDeleteId(null)
      }
      return {
        operation: 'deleted',
        presetId: preset.id,
        confirmationCleared: mountedRef.current && owner.current.revision === revision,
        reviewStatus: owner.current.revision === revision ? 'current' : 'changed'
      }
    } catch (error) {
      if (mountedRef.current && owner.current.revision === revision) {
        setOperationError(getSparsePresetOperationErrorMessage(error, 'Failed to delete preset.'))
        setConfirmingDeleteId(preset.id)
      }
      return { operation: 'delete-unconfirmed', presetId: preset.id }
    } finally {
      if (mountedRef.current) {
        setDeletingPresetId(null)
      }
    }
  }

  const handleRetryLoadPresets = async (): Promise<void> => {
    const revision = owner.current.revision
    setOperationError(null)
    try {
      await fetchSparsePresets(repoId)
    } catch (error) {
      if (mountedRef.current && owner.current.revision === revision) {
        setOperationError(
          getSparsePresetOperationErrorMessage(error, 'Failed to load sparse presets.')
        )
      }
    }
  }
  const onClearDeleteConfirm = (): void => {
    setConfirmingDeleteId(null)
  }
  useSparsePresetViewerController({
    surface: 'settings',
    repoId,
    ownerKey,
    open: false,
    draft,
    submitting: submitting || deletingPresetId !== null,
    disabled: !repo || getRepoExecutionHostId(repo).startsWith('runtime:'),
    visiblePresets: sortedPresets,
    presetsLoaded: presets !== undefined,
    presetsLoading: loadStatus === 'loading',
    presetsLoadError: loadError ?? null,
    selectedPresetId: null,
    canSave: canSaveDraft,
    operationError,
    handleOpenChange: () => undefined,
    startNewPreset,
    startEditPreset,
    handleSaveDraft,
    handleSelectOff: () => undefined,
    handleSelectPreset: () => undefined,
    handleRetryLoadPresets,
    finishDraft: closeDraft,
    setDraft,
    confirmingDeleteId,
    deletingPresetId,
    handleDeletePreset,
    onClearDeleteConfirm
  })
  return {
    ownerKey,
    repo,
    presets,
    loadStatus,
    loadError,
    draft,
    setDraft,
    submitting,
    confirmingDeleteId,
    deletingPresetId,
    operationError,
    sectionRef,
    closeDraft,
    sortedPresets,
    parsedDirectories,
    nameError,
    canSaveDraft,
    visibleError,
    startNewPreset,
    startEditPreset,
    handleSaveDraft,
    handleDeletePreset,
    handleRetryLoadPresets,
    onClearDeleteConfirm
  }
}
