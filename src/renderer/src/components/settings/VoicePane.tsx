import { attachVoicePaneRequest } from '@/runtime/voice-pane-request'
import { attachVoiceKeyDraftRequest } from '@/runtime/voice-key-draft-request'
import { attachVoiceKeyDialogRequest } from '@/runtime/voice-key-dialog-request'
import { UnsealedCredentialNotice } from './UnsealedCredentialNotice'
import type { SecretAtRestProtection } from '../../../../shared/secret-at-rest-protection'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { getDefaultVoiceSettings } from '../../../../shared/constants'
import type { SpeechModelManifest, VoiceSettings } from '../../../../shared/speech-types'
import { Separator } from '../ui/separator'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { OpenAiTranscriptionKeyDialog } from './OpenAiTranscriptionKeyDialog'
import { OpenAiTranscriptionSettingsRow } from './OpenAiTranscriptionSettingsRow'
import { handleVoiceDictationToggle } from './voice-dictation-toggle'
import { VoiceDictationSettingsSection } from './VoiceDictationSettingsSection'
import { VoiceSpeechModelSection } from './VoiceSpeechModelSection'
import { matchesSettingsSearch } from './settings-search'
import { getOpenaiTranscriptionSearchEntry } from './voice-pane-search'
import { translate } from '@/i18n/i18n'

export { handleVoiceDictationToggle }

type VoicePaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function VoicePane({ settings, updateSettings }: VoicePaneProps): React.JSX.Element {
  // Why: a stable fallback prevents the fetch effect from repeating on every parent render.
  const [defaultVoiceSettings] = useState(getDefaultVoiceSettings)
  const voiceSettings = settings.voice ?? defaultVoiceSettings
  const modelStates = useAppStore((s) => s.modelStates)
  const refreshModelStates = useAppStore((s) => s.refreshModelStates)
  const markFeatureTipsSeen = useAppStore((s) => s.markFeatureTipsSeen)
  const settingsSearchQuery = useAppStore((s) => s.settingsSearchQuery ?? '')
  const [catalog, setCatalog] = useState<SpeechModelManifest[]>([])
  const [permissionPending, setPermissionPending] = useState(false)
  const [openAiDialogOpen, setOpenAiDialogOpen] = useState(false)
  const [openAiApiKeyDraft, setOpenAiApiKeyDraft] = useState('')
  const [openAiKeyPending, setOpenAiKeyPending] = useState(false)
  const [openAiKeyProtection, setOpenAiKeyProtection] = useState<SecretAtRestProtection | null>(
    null
  )
  const [pendingCloudModelId, setPendingCloudModelId] = useState<string | null>(null)
  const mountedRef = useRef(true)
  // Why: every write here is a read-modify-write of the whole voice object, and the
  // writers are async (key status probe, save/clear key). Merging onto the render-time
  // snapshot would resurrect settings that changed while the IPC was in flight — e.g.
  // reverting `enabled` to false and leaving the microphone picker permanently disabled.
  // Written in an effect, not during render: the async writers all run post-commit.
  const voiceSettingsRef = useRef(voiceSettings)
  useEffect(() => {
    voiceSettingsRef.current = voiceSettings
  }, [voiceSettings])

  const handlePaneRef = useCallback((node: HTMLDivElement | null): void => {
    mountedRef.current = node !== null
  }, [])

  const updateVoiceSettings = useCallback(
    (updates: Partial<VoiceSettings>): void => {
      updateSettings({
        voice: {
          ...voiceSettingsRef.current,
          ...updates
        }
      })
    },
    [updateSettings]
  )

  useEffect(() => {
    let cancelled = false
    refreshModelStates()
    void window.api.speech
      .getCatalog()
      .then((nextCatalog) => {
        if (!cancelled) {
          setCatalog(nextCatalog)
        }
      })
      .catch(() => {})
    void window.api.speech
      .getOpenAiApiKeyStatus()
      .then((status) => {
        if (cancelled) {
          return
        }
        setOpenAiKeyProtection(status.protection)
        if (status.configured !== voiceSettings.openAiApiKeyConfigured) {
          updateVoiceSettings({ openAiApiKeyConfigured: status.configured })
          refreshModelStates()
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshModelStates, updateVoiceSettings, voiceSettings.openAiApiKeyConfigured])

  useEffect(() => {
    const cleanup = window.api.speech.onDownloadProgress(() => {
      refreshModelStates()
    })
    return cleanup
  }, [refreshModelStates])

  const toggleVoiceDictation = useCallback(async (): Promise<boolean> => {
    return handleVoiceDictationToggle({
      voiceEnabled: voiceSettings.enabled,
      markFeatureTipsSeen,
      updateVoiceSettings,
      requestMicrophonePermission: () =>
        window.api.developerPermissions.request({ id: 'microphone' }),
      setPermissionPending,
      isMounted: () => mountedRef.current,
      notifyPermissionGranted: () =>
        toast.success(
          translate(
            'auto.components.settings.VoicePane.cd9fe37556',
            'Microphone permission granted'
          )
        ),
      notifyPermissionOpenedSystemSettings: () =>
        toast.message(
          translate(
            'auto.components.settings.VoicePane.1eac933202',
            'Opened macOS Privacy & Security. Enable dictation again after granting access.'
          )
        ),
      notifyPermissionRequired: () =>
        toast.message(
          translate(
            'auto.components.settings.VoicePane.f9a9cf6928',
            'Microphone permission is required before enabling voice dictation.'
          )
        ),
      notifyPermissionRequestFailed: () =>
        toast.error(
          translate(
            'auto.components.settings.VoicePane.ad5d036ecc',
            'Could not request microphone permission. Voice dictation was not enabled.'
          )
        )
    })
  }, [voiceSettings.enabled, markFeatureTipsSeen, updateVoiceSettings])

  const selectedModel = catalog.find((m) => m.id === voiceSettings.sttModel)
  const showOpenAiSettingsRow =
    voiceSettings.openAiApiKeyConfigured ||
    selectedModel?.provider === 'openai' ||
    (settingsSearchQuery.trim() !== '' &&
      matchesSettingsSearch(settingsSearchQuery, getOpenaiTranscriptionSearchEntry()))

  const openOpenAiDialog = useCallback((modelId: string | null = null): void => {
    setPendingCloudModelId(modelId)
    setOpenAiApiKeyDraft('')
    setOpenAiDialogOpen(true)
  }, [])

  useEffect(
    () =>
      attachVoiceKeyDialogRequest((open, modelId) => {
        if (openAiKeyPending) {
          return
        }
        if (open) {
          if (
            modelId &&
            !catalog.some((model) => model.id === modelId && model.provider === 'openai')
          ) {
            return
          }
          openOpenAiDialog(modelId)
        } else {
          setOpenAiDialogOpen(false)
          setOpenAiApiKeyDraft('')
          setPendingCloudModelId(null)
        }
      }),
    [openAiKeyPending, openOpenAiDialog, catalog]
  )

  useEffect(
    () =>
      attachVoiceKeyDraftRequest((draft) => {
        if (!openAiDialogOpen || openAiKeyPending) {
          return false
        }
        setOpenAiApiKeyDraft(draft)
        return true
      }),
    [openAiDialogOpen, openAiKeyPending]
  )

  const saveOpenAiApiKey = useCallback(async (): Promise<boolean> => {
    setOpenAiKeyPending(true)
    try {
      await window.api.speech.saveOpenAiApiKey(openAiApiKeyDraft)
      const status = await window.api.speech.getOpenAiApiKeyStatus()
      if (!status.configured) {
        throw new Error('voice_key_save_not_configured')
      }
      setOpenAiKeyProtection(status.protection)
      updateVoiceSettings({
        openAiApiKeyConfigured: true,
        sttModel: pendingCloudModelId ?? voiceSettings.sttModel
      })
      await refreshModelStates()
      setOpenAiDialogOpen(false)
      setOpenAiApiKeyDraft('')
      setPendingCloudModelId(null)
      toast.success(
        translate('auto.components.settings.VoicePane.506df81ba6', 'OpenAI API key saved')
      )
      return true
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : translate(
              'auto.components.settings.VoicePane.8572bbb537',
              'Failed to save OpenAI API key'
            )
      )
      return false
    } finally {
      if (mountedRef.current) {
        setOpenAiKeyPending(false)
      }
    }
  }, [
    openAiApiKeyDraft,
    pendingCloudModelId,
    voiceSettings.sttModel,
    updateVoiceSettings,
    refreshModelStates
  ])

  const clearOpenAiApiKey = useCallback(async (): Promise<boolean> => {
    setOpenAiKeyPending(true)
    try {
      await window.api.speech.clearOpenAiApiKey()
      const status = await window.api.speech.getOpenAiApiKeyStatus()
      if (status.configured) {
        throw new Error('voice_key_clear_still_configured')
      }
      setOpenAiKeyProtection(status.protection)
      updateVoiceSettings({
        openAiApiKeyConfigured: false,
        sttModel:
          catalog.find((model) => model.id === voiceSettingsRef.current.sttModel)?.provider ===
          'openai'
            ? ''
            : voiceSettingsRef.current.sttModel
      })
      await refreshModelStates()
      setOpenAiDialogOpen(false)
      setOpenAiApiKeyDraft('')
      setPendingCloudModelId(null)
      toast.success(
        translate('auto.components.settings.VoicePane.37aba8bb63', 'OpenAI API key cleared')
      )
      return true
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : translate(
              'auto.components.settings.VoicePane.62d2a84d31',
              'Failed to clear OpenAI API key'
            )
      )
      return false
    } finally {
      if (mountedRef.current) {
        setOpenAiKeyPending(false)
      }
    }
  }, [catalog, updateVoiceSettings, refreshModelStates])

  useEffect(
    () =>
      attachVoicePaneRequest(async (action) => {
        if (!mountedRef.current || openAiKeyPending || permissionPending) {
          return false
        }
        switch (action) {
          case 'toggle':
            await toggleVoiceDictation()
            return mountedRef.current
          case 'refresh-models':
            await refreshModelStates()
            return mountedRef.current
          case 'save-key':
            if (!openAiDialogOpen || !openAiApiKeyDraft.trim()) {
              return false
            }
            return saveOpenAiApiKey()
          case 'clear-key':
            return clearOpenAiApiKey()
        }
      }),
    [
      openAiKeyPending,
      permissionPending,
      openAiDialogOpen,
      openAiApiKeyDraft,
      toggleVoiceDictation,
      refreshModelStates,
      saveOpenAiApiKey,
      clearOpenAiApiKey
    ]
  )

  return (
    <div
      ref={handlePaneRef}
      data-voice-settings-pane
      data-voice-pane-pending={openAiKeyPending || permissionPending}
      data-voice-model-count={modelStates.length}
      data-voice-selected-model={voiceSettings.sttModel}
      data-voice-key-configured={voiceSettings.openAiApiKeyConfigured}
      className="space-y-1"
    >
      <VoiceDictationSettingsSection
        voiceSettings={voiceSettings}
        permissionPending={permissionPending}
        onToggleVoiceDictation={() => void toggleVoiceDictation()}
        onUpdateVoiceSettings={updateVoiceSettings}
      />

      <VoiceSpeechModelSection
        voiceSettings={voiceSettings}
        catalog={catalog}
        modelStates={modelStates}
        onUpdateVoiceSettings={updateVoiceSettings}
        onOpenOpenAiDialog={openOpenAiDialog}
        onRefreshModelStates={refreshModelStates}
      />

      {showOpenAiSettingsRow && (
        <>
          <Separator />
          <UnsealedCredentialNotice
            protection={openAiKeyProtection}
            credentialName={translate(
              'auto.components.settings.VoicePane.openAiKeyName',
              'Your OpenAI transcription key'
            )}
          />
          <OpenAiTranscriptionSettingsRow
            configured={voiceSettings.openAiApiKeyConfigured}
            disabled={openAiKeyPending}
            onConfigure={() => openOpenAiDialog(null)}
            onClear={() => void clearOpenAiApiKey()}
          />
        </>
      )}

      <OpenAiTranscriptionKeyDialog
        open={openAiDialogOpen}
        configured={voiceSettings.openAiApiKeyConfigured}
        apiKeyDraft={openAiApiKeyDraft}
        pending={openAiKeyPending}
        onOpenChange={setOpenAiDialogOpen}
        onApiKeyDraftChange={setOpenAiApiKeyDraft}
        onSave={() => void saveOpenAiApiKey()}
        onClear={() => void clearOpenAiApiKey()}
      />
    </div>
  )
}
