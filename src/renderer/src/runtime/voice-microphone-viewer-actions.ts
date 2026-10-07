import {
  refreshVoiceMicrophoneOwner,
  selectVoiceMicrophoneOwner,
  startVoiceMicrophoneOwner
} from './voice-microphone-owner'
import { requireHostViewer, waitForView } from './voice-viewer-target'
import { useAppStore } from '@/store'
import { normalizeMicrophoneDeviceId } from '@/components/dictation/microphone-devices'
import { cancelMicrophoneRequest, readMicrophoneRequest } from './voice-microphone-requests'
import type { VoiceViewerOperation, VoiceViewerResult } from '../../../shared/voice-viewer'
export async function applyVoiceMicrophoneViewerAction(
  command: VoiceViewerOperation,
  expiresAt: number
): Promise<Omit<VoiceViewerResult, 'viewerId'> | null> {
  const result = { viewer: 'host' as const, applied: true, persisted: false }
  if (
    ['microphones-list', 'microphone-select', 'microphone-request-start'].includes(
      command.operation
    )
  ) {
    requireHostViewer().openSettingsTarget({ pane: 'voice', repoId: null })
    requireHostViewer().openSettingsPage()
    if (
      !(await waitForView(
        () => document.querySelector('[data-voice-settings-pane]') !== null,
        expiresAt
      ))
    ) {
      throw new Error('voice_pane_not_rendered')
    }
  }
  if (command.operation === 'microphones-list') {
    const devices = await refreshVoiceMicrophoneOwner()
    requireHostViewer()
    return { ...result, devices }
  }
  if (command.operation === 'microphone-select') {
    const id = normalizeMicrophoneDeviceId(command.deviceId)
    await selectVoiceMicrophoneOwner(id)
    const applied = await waitForView(
      () => useAppStore.getState().settings?.voice?.microphoneDeviceId === id,
      expiresAt
    )
    const durable = await window.api.settings.get()
    return {
      ...result,
      microphoneDeviceId: id,
      persisted: durable.voice?.microphoneDeviceId === id,
      applied
    }
  }
  if (command.operation === 'microphone-request-start') {
    return { ...result, ...startVoiceMicrophoneOwner(), persisted: false }
  }
  if (command.operation === 'microphone-request-status') {
    return { ...result, ...readMicrophoneRequest(command.operationId), persisted: false }
  }
  if (command.operation === 'microphone-request-cancel') {
    return { ...result, ...cancelMicrophoneRequest(command.operationId), persisted: false }
  }
  return null
}
