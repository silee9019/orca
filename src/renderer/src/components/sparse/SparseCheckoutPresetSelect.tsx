import { useSparsePresetSelect } from './use-sparse-preset-select'
import React from 'react'
import { ChevronsUpDown, LoaderCircle, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SparsePresetChooser } from './SparsePresetChooser'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { SparsePreset } from '../../../../shared/worktree/create-types'
import { translate } from '@/i18n/i18n'
import { SparsePresetInlineEditor } from './SparsePresetInlineEditor'

export type SparseCheckoutPresetSelectProps = {
  repoId: string
  presets: SparsePreset[]
  selectedPresetId: string | null
  onSelectPreset: (preset: SparsePreset | null) => void
  disabled?: boolean
  onEditingChange?: (editing: boolean) => void
}

export default function SparseCheckoutPresetSelect({
  repoId,
  presets,
  selectedPresetId,
  onSelectPreset,
  disabled = false,
  onEditingChange
}: SparseCheckoutPresetSelectProps): React.JSX.Element {
  const {
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
  } = useSparsePresetSelect({
    repoId,
    presets,
    selectedPresetId,
    onSelectPreset,
    disabled,
    onEditingChange
  })
  const triggerLabel = isLoadingPresets
    ? translate('sparsePreset.loading', 'Loading presets...')
    : hasPresetLoadError
      ? translate(
          'auto.components.sparse.SparseCheckoutPresetSelect.a683a4bc8e',
          'Retry loading presets'
        )
      : !presetsLoaded
        ? translate('auto.components.sparse.SparseCheckoutPresetSelect.16223dde6a', 'Load presets')
        : selectedPreset
          ? selectedPreset.name
          : translate('sparsePreset.fullCheckout', 'Full checkout')

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            role="combobox"
            aria-label={translate('sparsePreset.checkoutPreset', 'Checkout preset')}
            aria-expanded={open}
            aria-busy={isLoadingPresets}
            aria-disabled={Boolean(draft) || undefined}
            disabled={disabled || isLoadingPresets}
            className="w-full justify-between"
          >
            <span className="truncate">{triggerLabel}</span>
            {isLoadingPresets ? (
              <LoaderCircle className="size-3.5 animate-spin opacity-60" />
            ) : hasPresetLoadError || !presetsLoaded ? (
              <RefreshCcw className="size-3.5 opacity-60" />
            ) : (
              <ChevronsUpDown className="size-3.5 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={0}
          wheelScroll
          className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)]"
          onCloseAutoFocus={(event) => {
            if (draft) {
              event.preventDefault()
            }
          }}
        >
          {!presetsLoaded ? (
            <div className="p-1">
              {hasPresetLoadError ? (
                <div className="px-2 py-1.5 text-[11px] text-destructive">
                  <span className="break-words">{presetsLoadError}</span>
                </div>
              ) : null}
              <button
                type="button"
                className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                onClick={handleRetryLoadPresets}
              >
                <RefreshCcw className="size-3.5 text-muted-foreground" />
                <span className="truncate">
                  {hasPresetLoadError
                    ? translate(
                        'auto.components.sparse.SparseCheckoutPresetSelect.a683a4bc8e',
                        'Retry loading presets'
                      )
                    : translate(
                        'auto.components.sparse.SparseCheckoutPresetSelect.16223dde6a',
                        'Load presets'
                      )}
                </span>
              </button>
            </div>
          ) : (
            <SparsePresetChooser
              viewerScope={{ repoId, ownerKey }}
              presets={visiblePresets}
              selectedPresetId={selectedPresetId}
              onSelect={handleSelectPreset}
              onSelectFull={handleSelectOff}
              onEdit={startEditPreset}
              onNew={startNewPreset}
            />
          )}
        </PopoverContent>
      </Popover>
      {draft ? (
        <SparsePresetInlineEditor
          viewerScope={{ repoId, ownerKey }}
          draft={draft}
          parsedDirectories={parsedDirectories}
          nameError={nameError}
          submitting={submitting}
          canSave={canSave}
          setNameInputNode={setNameInputNode}
          onDraftChange={setDraft}
          onCancel={finishDraft}
          onSave={() => void handleSaveDraft()}
          operationError={operationError}
          repoRootPath={repo?.path}
          repoConnectionId={repo?.connectionId ?? undefined}
        />
      ) : null}
    </>
  )
}
