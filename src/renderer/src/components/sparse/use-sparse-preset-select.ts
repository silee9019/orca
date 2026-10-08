import { useSparsePresetNameFocus } from './use-sparse-preset-name-focus'
import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { useAppStore } from '@/store'
import { parseSparsePresetDirectories, validateSparsePresetName } from '@/lib/sparse-preset-draft'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import type { SparsePreset } from '../../../../shared/worktree/create-types'
import type { SparsePresetDraft } from './SparseCheckoutPresetDraftForm'
import type { SparseCheckoutPresetSelectProps } from './SparseCheckoutPresetSelect'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { useSparsePresetViewerController } from '../../runtime/sparse-preset-viewer-controller'
import type { SparsePresetSaveOutcome } from '../../runtime/sparse-preset-viewer-state'

export function useSparsePresetSelect({
  repoId,
  presets,
  selectedPresetId,
  onSelectPreset,
  disabled = false,
  onEditingChange
}: SparseCheckoutPresetSelectProps) {
  const repo = useAppStore((s) => s.repos.find((entry) => entry.id === repoId))
  const profileId = useAppStore((state) => state.activeOrcaProfileId)
  const ownerKey = JSON.stringify([
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
  const fetchSparsePresets = useAppStore((s) => s.fetchSparsePresets)
  const saveSparsePreset = useAppStore((s) => s.saveSparsePreset)
  const presetsForRepo = useAppStore((s) => s.sparsePresetsByRepo[repoId])
  const presetsLoadStatus = useAppStore((s) => s.sparsePresetsLoadStatusByRepo[repoId] ?? 'idle')
  const presetsLoading = presetsLoadStatus === 'loading'
  const presetsLoadError = useAppStore((s) => s.sparsePresetsErrorByRepo[repoId] ?? null)

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<SparsePresetDraft | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { setNameInputNode, focusName } = useSparsePresetNameFocus()
  const mountedRef = useMountedRef()

  useEffect(() => () => onEditingChange?.(false), [onEditingChange])

  const finishDraft = useCallback(() => {
    setDraft(null)
    onEditingChange?.(false)
    triggerRef.current?.focus()
  }, [onEditingChange])

  const visiblePresets = presetsForRepo ?? presets
  const presetsLoaded = presetsForRepo !== undefined
  const isLoadingPresets = !disabled && presetsLoading
  const hasPresetLoadError = !disabled && !presetsLoaded && !!presetsLoadError
  const selectedPreset = useMemo(
    () => visiblePresets.find((preset) => preset.id === selectedPresetId) ?? null,
    [visiblePresets, selectedPresetId]
  )
  const parsedDirectories = draft ? parseSparsePresetDirectories(draft.directoriesText) : null
  const trimmedName = draft?.name.trim() ?? ''
  const nameError = draft
    ? validateSparsePresetName(draft.name, visiblePresets, draft.presetId)
    : null
  const canSave =
    draft !== null &&
    !submitting &&
    !disabled &&
    presetsLoaded &&
    !nameError &&
    parsedDirectories !== null &&
    !parsedDirectories.error

  const startDraft = useCallback(
    (nextDraft: SparsePresetDraft): void => {
      if (disabled || !presetsLoaded) {
        return
      }
      setOpen(false)
      setOperationError(null)
      setDraft(nextDraft)
      onEditingChange?.(true)
      focusName()
    },
    [focusName, disabled, onEditingChange, presetsLoaded]
  )

  const startNewPreset = useCallback((): void => {
    startDraft({ mode: 'new', name: '', directoriesText: '' })
  }, [startDraft])

  const handleRetryLoadPresets = useCallback(async (): Promise<void> => {
    if (disabled || presetsLoading) {
      return
    }
    setDraft(null)
    await fetchSparsePresets(repoId)
  }, [disabled, fetchSparsePresets, presetsLoading, repoId])

  const startEditPreset = useCallback(
    (preset: SparsePreset): void => {
      startDraft({
        mode: 'edit',
        presetId: preset.id,
        name: preset.name,
        directoriesText: preset.directories.join('\n')
      })
    },
    [startDraft]
  )

  const handleSaveDraft = useCallback(async (): Promise<SparsePresetSaveOutcome> => {
    if (!draft || !canSave || !parsedDirectories) {
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
          reviewStatus: 'current'
        }
      }
      if (saved && (!mountedRef.current || owner.current.revision !== revision)) {
        return {
          operation: 'saved',
          preset: saved,
          selected: false,
          editorClosed: false,
          reviewStatus: 'changed'
        }
      }
      if (saved && mountedRef.current) {
        if (draft.mode === 'new' || selectedPresetId === saved.id) {
          onSelectPreset(saved)
        }
        finishDraft()
        setOpen(false)
        return {
          operation: 'saved',
          preset: saved,
          selected: draft.mode === 'new' || selectedPresetId === saved.id,
          editorClosed: true,
          reviewStatus: 'current'
        }
      } else if (mountedRef.current && owner.current.revision === revision) {
        setOperationError(
          translate('sparsePreset.saveFailed', 'Could not save the preset. Try again.')
        )
      }
      return acknowledgement
    } catch {
      if (mountedRef.current && owner.current.revision === revision) {
        setOperationError(
          translate('sparsePreset.saveFailed', 'Could not save the preset. Try again.')
        )
      }
      return acknowledgement
    } finally {
      if (mountedRef.current) {
        setSubmitting(false)
      }
    }
  }, [
    canSave,
    draft,
    finishDraft,
    mountedRef,
    onSelectPreset,
    parsedDirectories,
    repoId,
    saveSparsePreset,
    selectedPresetId,
    trimmedName
  ])

  const handleOpenChange = (nextOpen: boolean): void => {
    if (nextOpen && draft) {
      return
    }
    if (nextOpen && presetsLoading) {
      setOpen(false)
      setDraft(null)
      return
    }
    setOpen(nextOpen)
  }

  const handleSelectOff = useCallback((): void => {
    if (disabled || !presetsLoaded) {
      return
    }
    onSelectPreset(null)
    setDraft(null)
    setOpen(false)
  }, [disabled, onSelectPreset, presetsLoaded])

  const handleSelectPreset = useCallback(
    (preset: SparsePreset): void => {
      if (disabled || !presetsLoaded) {
        return
      }
      onSelectPreset(preset)
      setDraft(null)
      setOpen(false)
    },
    [disabled, onSelectPreset, presetsLoaded]
  )

  useSparsePresetViewerController({
    surface: 'selector',
    repoId,
    ownerKey,
    open,
    draft,
    submitting,
    disabled: disabled || !repo || getRepoExecutionHostId(repo).startsWith('runtime:'),
    visiblePresets,
    presetsLoaded,
    presetsLoading,
    presetsLoadError,
    selectedPresetId,
    canSave,
    operationError,
    handleOpenChange,
    startNewPreset,
    startEditPreset,
    handleSaveDraft,
    handleSelectOff,
    handleSelectPreset,
    handleRetryLoadPresets,
    finishDraft,
    setDraft
  })
  return {
    ownerKey,
    repo,
    open,
    draft,
    submitting,
    operationError,
    triggerRef,
    visiblePresets,
    presetsLoaded,
    isLoadingPresets,
    hasPresetLoadError,
    presetsLoadError,
    selectedPreset,
    parsedDirectories,
    nameError,
    canSave,
    setNameInputNode,
    startNewPreset,
    startEditPreset,
    handleSaveDraft,
    handleSelectOff,
    handleSelectPreset,
    handleRetryLoadPresets,
    finishDraft,
    setDraft,
    handleOpenChange
  }
}
