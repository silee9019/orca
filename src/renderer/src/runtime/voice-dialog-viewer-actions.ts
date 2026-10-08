import { startVoicePaneRequest, readVoicePaneRequest } from './voice-pane-request'
import type { VoiceViewerOperation, VoiceViewerResult } from '../../../shared/voice-viewer'
import { requireHostViewer, waitForView } from './voice-viewer-target'
import { requestVoiceKeyDraft } from './voice-key-draft-request'
import { requestVmCleanupConfirm } from './vm-cleanup-confirm-request'
import { readVoiceModelDelete, startVoiceModelDelete } from './voice-model-delete-request'

export async function applyVoiceDialogViewerAction(
  command: VoiceViewerOperation,
  expiresAt: number
): Promise<Omit<VoiceViewerResult, 'viewerId'> | null> {
  const result = { viewer: 'host' as const, persisted: false, applied: true }
  switch (command.operation) {
    case 'voice-toggle':
    case 'voice-refresh-models':
    case 'key-save':
    case 'key-clear': {
      const pane = requireHostViewer()
      if (command.operation !== 'key-save') {
        pane.openSettingsTarget({ pane: 'voice', repoId: null })
        pane.openSettingsPage()
      }
      if (
        !(await waitForView(
          () => document.querySelector('[data-voice-settings-pane]') !== null,
          expiresAt
        ))
      ) {
        throw new Error('voice_pane_not_rendered')
      }
      const operation = startVoicePaneRequest(
        command.operation === 'voice-toggle'
          ? 'toggle'
          : command.operation === 'voice-refresh-models'
            ? 'refresh-models'
            : command.operation === 'key-save'
              ? 'save-key'
              : 'clear-key'
      )
      return { ...result, ...operation }
    }
    case 'voice-pane-status': {
      const operation = readVoicePaneRequest(command.operationId)
      const voice = requireHostViewer().settings?.voice
      return {
        ...result,
        ...operation,
        voiceEnabled: voice?.enabled === true,
        keyConfigured: voice?.openAiApiKeyConfigured === true,
        applied: operation.paneState !== 'failed',
        reason: operation.paneState === 'failed' ? 'voice_pane_operation_failed' : undefined
      }
    }
    case 'key-draft':
    case 'key-draft-clear': {
      const draft = command.operation === 'key-draft' ? command.apiKey : ''
      if (!requestVoiceKeyDraft(draft)) {
        throw new Error('voice_key_dialog_busy_or_closed')
      }
      const applied = await waitForView(
        () =>
          document.querySelector<HTMLInputElement>('[data-voice-key-dialog] input[type="password"]')
            ?.value === draft,
        expiresAt
      )
      return { ...result, applied, draftPresent: draft.length > 0 }
    }
    case 'vm-stop-confirm-open':
    case 'vm-stop-confirm-cancel': {
      const state = requireHostViewer()
      if (state.settings?.experimentalEphemeralVms !== true) {
        throw new Error('vm_feature_disabled')
      }
      if (state.activeModal !== 'none') {
        throw new Error('viewer_modal_busy')
      }
      state.openSettingsTarget({ pane: 'experimental', repoId: null, sectionId: 'ephemeral-vms' })
      state.openSettingsPage()
      if (
        !(await waitForView(
          () => document.querySelector('[data-settings-section="temporary-vm-runtimes"]') !== null,
          expiresAt
        ))
      ) {
        throw new Error('vm_runtime_section_unavailable')
      }
      if (
        !requestVmCleanupConfirm({
          operation: command.operation === 'vm-stop-confirm-open' ? 'open' : 'cancel',
          runtimeId: command.runtimeId
        })
      ) {
        throw new Error('vm_cleanup_confirm_busy_or_target_missing')
      }
      const applied = await waitForView(() => {
        const open = [...document.querySelectorAll('[data-vm-cleanup-confirm-runtime]')].some(
          (element) => element.getAttribute('data-vm-cleanup-confirm-runtime') === command.runtimeId
        )
        return open === (command.operation === 'vm-stop-confirm-open')
      }, expiresAt)
      return { ...result, applied }
    }
    case 'model-delete-start': {
      if (command.confirmation !== command.modelId) {
        throw new Error('voice_model_confirmation_mismatch')
      }
      const state = requireHostViewer()
      if (state.activeModal !== 'none') {
        throw new Error('viewer_modal_busy')
      }
      state.openSettingsTarget({ pane: 'voice', repoId: null })
      state.openSettingsPage()
      if (
        !(await waitForView(
          () => document.querySelector('[data-voice-settings-pane]') !== null,
          expiresAt
        ))
      ) {
        throw new Error('voice_pane_not_rendered')
      }
      const started = startVoiceModelDelete(command.modelId)
      const applied = await waitForView(
        () =>
          readVoiceModelDelete(started.operationId).deleteState !== 'pending' ||
          [...document.querySelectorAll('[data-voice-pending-model-deletes]')].some((element) =>
            element
              .getAttribute('data-voice-pending-model-deletes')
              ?.includes(JSON.stringify(command.modelId))
          ),
        expiresAt
      )
      const current = readVoiceModelDelete(started.operationId)
      return { ...result, ...current, applied: applied && current.deleteState !== 'failed' }
    }
    case 'model-delete-status':
      return { ...result, ...readVoiceModelDelete(command.operationId) }
    case 'dictation-start':
    case 'dictation-toggle':
    case 'dictation-stop':
    case 'dictation-cancel':
    case 'dictation-status':
    case 'key-dialog-close':
    case 'key-dialog-open':
    case 'microphone-request-cancel':
    case 'microphone-request-start':
    case 'microphone-request-status':
    case 'microphone-select':
    case 'microphones-list':
    case 'settings-open':
    case 'tip-close':
    case 'tip-enable':
    case 'tip-focus-primary':
    case 'tip-settings-open':
    case 'tip-show':
    case 'tip-skip':
    case 'vm-composer':
    case 'vm-runtimes-refresh':
    case 'vm-runtime-cleanup':
    case 'vm-runtime-stop':
    case 'vm-runtime-status':
    case 'vm-copy-cleanup':
    case 'vm-copy-prompt':
    case 'vm-catalog-refresh':
      return null
  }
}
