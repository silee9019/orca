import { requestVoiceKeyDialog } from './voice-key-dialog-request'
import { useAppStore } from '@/store'
import { getDefaultVoiceSettings } from '../../../shared/constants'
import {
  VoiceViewerParams,
  type VoiceViewerRequest,
  type VoiceViewerResult
} from '../../../shared/voice-viewer'
import { EPHEMERAL_VM_SETUP_PROMPT } from '../../../shared/ephemeral-vm-setup-prompt'
import {
  listVoiceMicrophoneDevices,
  normalizeMicrophoneDeviceId
} from '@/components/dictation/microphone-devices'
import {
  cancelMicrophoneRequest,
  cancelPendingMicrophoneRequests,
  readMicrophoneRequest,
  startMicrophoneRequest
} from './voice-microphone-requests'

function requireHostViewer(): ReturnType<typeof useAppStore.getState> {
  const state = useAppStore.getState()
  if (!state.persistedUIReady || !state.settings) {
    throw new Error('viewer_not_ready')
  }
  if (state.settings.activeRuntimeEnvironmentId) {
    throw new Error('viewer_runtime_mismatch')
  }
  return state
}

async function waitForView(test: () => boolean, expiresAt: number): Promise<boolean> {
  while (Date.now() < expiresAt) {
    requireHostViewer()
    if (test()) {
      return true
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  return false
}

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
    case 'microphones-list': {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error('microphone_unavailable')
      }
      const devices = listVoiceMicrophoneDevices(await navigator.mediaDevices.enumerateDevices())
      requireHostViewer()
      return { ...result, devices }
    }
    case 'microphone-select': {
      const id = normalizeMicrophoneDeviceId(command.deviceId)
      const devices = listVoiceMicrophoneDevices(await navigator.mediaDevices.enumerateDevices())
      requireHostViewer()
      const device = devices.find((entry) => entry.deviceId === id)
      if (id && !device) {
        throw new Error('microphone_device_not_found')
      }
      const voice = useAppStore.getState().settings?.voice ?? getDefaultVoiceSettings()
      await initial.updateSettingsOrThrow({
        voice: { ...voice, microphoneDeviceId: id, microphoneDeviceLabel: device?.label ?? null }
      })
      requireHostViewer()
      const durable = await window.api.settings.get()
      const current = useAppStore.getState().settings?.voice
      return {
        ...result,
        microphoneDeviceId: id,
        persisted: durable.voice?.microphoneDeviceId === id,
        applied: current?.microphoneDeviceId === id
      }
    }
    case 'microphone-request-start':
      return { ...result, ...startMicrophoneRequest(), persisted: false }
    case 'microphone-request-status':
      return { ...result, ...readMicrophoneRequest(command.operationId), persisted: false }
    case 'microphone-request-cancel':
      return { ...result, ...cancelMicrophoneRequest(command.operationId), persisted: false }
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
      requestVoiceKeyDialog(command.operation === 'key-dialog-open')
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
      if (initial.activeModal) {
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
      if (requireHostViewer().activeModal) {
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
    case 'vm-copy-prompt': {
      await window.api.ui.writeClipboardText(EPHEMERAL_VM_SETUP_PROMPT)
      await requireHostViewer().recordFeatureInteraction('ephemeral-vm-setup')
      return {
        ...result,
        applied: (await window.api.ui.readClipboardText()) === EPHEMERAL_VM_SETUP_PROMPT
      }
    }
    case 'vm-copy-cleanup': {
      const cleanup = await window.api.ephemeralVm.getCleanupCommand({
        runtimeId: command.runtimeId
      })
      requireHostViewer()
      const text = cleanup.command
        ? `${cleanup.command}\n\n# Cleanup payload:\n${cleanup.payloadJson}`
        : cleanup.payloadJson
      await window.api.ui.writeClipboardText(text)
      return { ...result, applied: (await window.api.ui.readClipboardText()) === text }
    }
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
