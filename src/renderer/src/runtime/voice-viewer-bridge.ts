import { applyVoiceMicrophoneViewerAction } from './voice-microphone-viewer-actions'
import { applyVmRuntimeViewerAction } from './vm-runtime-viewer-actions'
import { applyVoiceDictationViewerAction } from './voice-dictation-viewer-actions'
import { requireHostViewer, waitForView } from './voice-viewer-target'
import { applyVoiceDialogViewerAction } from './voice-dialog-viewer-actions'
import { requestVoiceKeyDialog } from './voice-key-dialog-request'
import { useAppStore } from '@/store'
import { getDefaultVoiceSettings } from '../../../shared/constants'
import {
  VoiceViewerParams,
  type VoiceViewerRequest,
  type VoiceViewerResult
} from '../../../shared/voice-viewer'
import { applyVmPaneViewerAction } from './vm-pane-viewer-actions'
import { cancelPendingMicrophoneRequests } from './voice-microphone-requests'

export async function applyVoiceViewerRequest(
  request: VoiceViewerRequest
): Promise<Omit<VoiceViewerResult, 'viewerId'>> {
  const command = VoiceViewerParams.parse(request.command)
  const initial = requireHostViewer()
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const result = { viewer: 'host' as const, applied: true, persisted: false }
  switch (command.operation) {
    case 'microphones-list':
    case 'microphone-select':
    case 'microphone-request-start':
    case 'microphone-request-status':
    case 'microphone-request-cancel':
      return (await applyVoiceMicrophoneViewerAction(command, request.expiresAt)) ?? result
    case 'settings-open': {
      initial.openSettingsTarget({ pane: 'voice', repoId: null })
      initial.openSettingsPage()
      return {
        ...result,
        persisted: false,
        applied: await waitForView(
          () => document.querySelector('[data-voice-settings-pane]') !== null,
          request.expiresAt
        )
      }
    }
    case 'key-dialog-open':
    case 'key-dialog-close': {
      if (command.operation === 'key-dialog-open') {
        initial.openSettingsTarget({ pane: 'voice', repoId: null })
        initial.openSettingsPage()
        if (
          !(await waitForView(
            () => document.querySelector('[data-voice-settings-pane]') !== null,
            request.expiresAt
          ))
        ) {
          throw new Error('voice_pane_not_rendered')
        }
      }
      requestVoiceKeyDialog(
        command.operation === 'key-dialog-open',
        command.operation === 'key-dialog-open' ? (command.modelId ?? null) : null
      )
      return {
        ...result,
        persisted: false,
        applied: await waitForView(
          () =>
            (document.querySelector('[data-voice-key-dialog]') !== null) ===
            (command.operation === 'key-dialog-open'),
          request.expiresAt
        )
      }
    }
    case 'tip-show': {
      initial.openModal('feature-tips', { tipId: 'voice-dictation', source: 'cli' })
      return {
        ...result,
        persisted: false,
        applied: await waitForView(
          () => document.querySelector('[data-voice-tip]') !== null,
          request.expiresAt
        )
      }
    }
    case 'tip-focus-primary': {
      if (initial.activeModal !== 'feature-tips' || initial.modalData.tipId !== 'voice-dictation') {
        throw new Error('voice_tip_not_open')
      }
      const button = document.querySelector<HTMLButtonElement>('[data-voice-tip-actions] button')
      if (!button) {
        throw new Error('voice_tip_not_rendered')
      }
      button.focus({ preventScroll: true })
      return { ...result, persisted: false, applied: document.activeElement === button }
    }
    case 'tip-close':
    case 'tip-skip':
    case 'tip-enable':
    case 'tip-settings-open': {
      if (initial.activeModal !== 'feature-tips' || initial.modalData.tipId !== 'voice-dictation') {
        throw new Error('voice_tip_not_open')
      }
      if (!window.api.ui.setWithAck) {
        throw new Error('persistence_ack_unavailable')
      }
      const seen = [...new Set([...initial.featureTipsSeenIds, 'voice-dictation' as const])]
      await window.api.ui.setWithAck({ featureTipsSeenIds: seen })
      requireHostViewer().markFeatureTipsSeen(['voice-dictation'])
      if (command.operation === 'tip-enable') {
        await useAppStore.getState().updateSettingsOrThrow({
          voice: {
            ...(useAppStore.getState().settings?.voice ?? getDefaultVoiceSettings()),
            enabled: true
          }
        })
      }
      if (command.operation === 'tip-enable' || command.operation === 'tip-settings-open') {
        requireHostViewer().openSettingsTarget({ pane: 'voice', repoId: null })
        requireHostViewer().openSettingsPage()
      }
      const currentTip = requireHostViewer()
      if (
        currentTip.activeModal !== 'feature-tips' ||
        currentTip.modalData.tipId !== 'voice-dictation'
      ) {
        throw new Error('voice_tip_changed')
      }
      currentTip.closeModal()
      const durable = await window.api.ui.get()
      const voiceSaved =
        command.operation !== 'tip-enable' ||
        (await window.api.settings.get()).voice?.enabled === true
      return {
        ...result,
        persisted: voiceSaved && durable.featureTipsSeenIds?.includes('voice-dictation') === true,
        applied: await waitForView(
          () =>
            document.querySelector('[data-voice-tip]') === null &&
            (!['tip-enable', 'tip-settings-open'].includes(command.operation) ||
              document.querySelector('[data-voice-settings-pane]') !== null),
          request.expiresAt
        )
      }
    }
    case 'vm-composer': {
      if (initial.activeModal !== 'none') {
        throw new Error('viewer_modal_busy')
      }
      const catalog = await window.api.ephemeralVm.listRecipes({ repoId: command.repoId })
      requireHostViewer()
      if (
        catalog.status !== 'ok' ||
        !catalog.recipes?.some((recipe) => recipe.id === command.recipeId)
      ) {
        throw new Error('vm_recipe_not_found')
      }
      if (requireHostViewer().activeModal !== 'none') {
        throw new Error('viewer_modal_busy')
      }
      initial.openModal('new-workspace-composer', {
        initialRepoId: command.repoId,
        initialEphemeralVmRecipeId: command.recipeId,
        telemetrySource: 'settings'
      })
      return {
        ...result,
        persisted: false,
        applied: await waitForView(
          () => document.querySelector('[data-vm-workspace-composer]') !== null,
          request.expiresAt
        )
      }
    }
    case 'vm-copy-prompt':
    case 'vm-catalog-refresh':
      return applyVmPaneViewerAction(command.operation, request.expiresAt)
    case 'vm-copy-cleanup':
    case 'vm-runtimes-refresh':
    case 'vm-runtime-cleanup':
    case 'vm-runtime-stop':
    case 'vm-runtime-status':
      return applyVmRuntimeViewerAction(command, request.expiresAt)
    case 'dictation-start':
    case 'dictation-toggle':
    case 'dictation-stop':
    case 'dictation-cancel':
    case 'dictation-status':
      return applyVoiceDictationViewerAction(command)
    case 'voice-toggle':
    case 'voice-refresh-models':
    case 'voice-pane-status':
    case 'key-save':
    case 'key-clear':
    case 'key-draft':
    case 'key-draft-clear':
    case 'model-delete-start':
    case 'model-delete-status':
    case 'vm-stop-confirm-open':
    case 'vm-stop-confirm-cancel':
      return (
        (await applyVoiceDialogViewerAction(command, request.expiresAt)) ?? {
          viewer: 'host',
          applied: false,
          persisted: false,
          reason: 'voice_viewer_operation_unavailable'
        }
      )
  }
}

export function attachVoiceViewerBridge(): () => void {
  if (!window.api.ui.onVoiceViewerRequest || !window.api.ui.respondVoiceViewer) {
    return () => {}
  }
  const unsubscribe = window.api.ui.onVoiceViewerRequest((request) => {
    void applyVoiceViewerRequest(request).then(
      (result) => {
        window.api.ui.respondVoiceViewer?.({
          id: request.id,
          ok: true,
          result: { ...result, viewerId: 0 }
        })
      },
      (error) => {
        window.api.ui.respondVoiceViewer?.({
          id: request.id,
          ok: false,
          error:
            error instanceof Error && /^[a-z][a-z0-9_]*$/.test(error.message)
              ? error.message
              : 'voice_viewer_failed'
        })
      }
    )
  })
  return () => {
    unsubscribe()
    cancelPendingMicrophoneRequests()
  }
}
