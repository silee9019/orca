import { useSparsePresetSettings } from './use-sparse-preset-settings'
import { Plus, RefreshCcw } from 'lucide-react'
import { Button } from '../ui/button'
import { SparsePresetDraftEditor } from './sparse-preset-draft-editor'
import { SparsePresetSettingsRow } from './sparse-preset-settings-row'
import { translate } from '@/i18n/i18n'

type SparsePresetSettingsSectionProps = {
  repoId: string
}

export function SparsePresetSettingsSection({
  repoId
}: SparsePresetSettingsSectionProps): React.JSX.Element {
  const {
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
  } = useSparsePresetSettings(repoId)
  const draftEditor = draft ? (
    <SparsePresetDraftEditor
      viewerScope={{ repoId, ownerKey }}
      draft={draft}
      operationError={operationError}
      setDraft={(nextDraft) => {
        if (nextDraft) {
          setDraft(nextDraft)
        } else {
          closeDraft()
        }
      }}
      nameError={nameError}
      parsedDirectories={parsedDirectories}
      canSaveDraft={canSaveDraft}
      submitting={submitting}
      onSave={() => void handleSaveDraft()}
      repoRootPath={repo?.path}
      repoConnectionId={repo?.connectionId ?? undefined}
    />
  ) : null

  return (
    <section ref={sectionRef} className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            {translate(
              'auto.components.settings.SparsePresetSettingsSection.388513be2d',
              'Sparse Checkout Presets'
            )}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.SparsePresetSettingsSection.17f8c4ce10',
              'Manage saved directory sets for sparse worktree creation.'
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={startNewPreset}
          disabled={!!draft || presets === undefined || deletingPresetId !== null}
        >
          <Plus className="size-3.5" />
          {translate(
            'auto.components.settings.SparsePresetSettingsSection.d7565029a9',
            'New Preset'
          )}
        </Button>
      </div>

      {visibleError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {visibleError}
        </div>
      ) : null}

      {draft?.mode === 'new' ? draftEditor : null}

      {presets === undefined ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
          {loadError
            ? translate(
                'auto.components.settings.SparsePresetSettingsSection.92c08ccae3',
                'Sparse presets could not be loaded.'
              )
            : translate(
                'auto.components.settings.SparsePresetSettingsSection.8deb7024ab',
                'Loading sparse presets...'
              )}
          {loadError ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadStatus === 'loading'}
                onClick={() => void handleRetryLoadPresets()}
              >
                <RefreshCcw />
                {translate('sparsePreset.retryLoad', 'Retry loading presets')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : sortedPresets.length === 0 && !draft ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
          {translate(
            'auto.components.settings.SparsePresetSettingsSection.88bfbf1a9c',
            'No sparse presets saved for this repository.'
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedPresets.map((preset) =>
            draft?.presetId === preset.id ? (
              <div key={preset.id}>{draftEditor}</div>
            ) : (
              <SparsePresetSettingsRow
                key={preset.id}
                preset={preset}
                confirmingDeleteId={confirmingDeleteId}
                deletingPresetId={deletingPresetId}
                submitting={submitting || !!draft}
                onEdit={startEditPreset}
                onDelete={handleDeletePreset}
                onClearDeleteConfirm={onClearDeleteConfirm}
              />
            )
          )}
        </div>
      )}
    </section>
  )
}
