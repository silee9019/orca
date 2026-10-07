import { attachVmPaneRequest } from './vm-pane-request'
import { EPHEMERAL_VM_SETUP_PROMPT } from '../../../shared/ephemeral-vm-setup-prompt'
import { attachVoiceMicrophoneOwner } from './voice-microphone-owner'
import { listVoiceMicrophoneDevices } from '@/components/dictation/microphone-devices'
import {
  attachVmRuntimeViewerRequest,
  readVmRuntimeViewerRequest
} from './vm-runtime-viewer-request'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultVoiceSettings } from '../../../shared/constants'
import type { VoiceSettings } from '../../../shared/speech-types'
import type { VoiceViewerOperation } from '../../../shared/voice-viewer'
import { applyVoiceViewerRequest } from './voice-viewer-bridge'

const fixtureState: {
  persistedUIReady: boolean
  openSettingsTarget: () => void
  openSettingsPage: () => void
  settings: { activeRuntimeEnvironmentId: string | null; voice: VoiceSettings }
  updateSettingsOrThrow: (updates: { voice: VoiceSettings }) => Promise<void>
} = {
  persistedUIReady: true,
  openSettingsTarget: vi.fn(),
  openSettingsPage: vi.fn(),
  settings: { activeRuntimeEnvironmentId: null, voice: getDefaultVoiceSettings() },
  updateSettingsOrThrow: async (updates: { voice: VoiceSettings }) => {
    fixtureState.settings.voice = updates.voice
  }
}
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixtureState } }))
const detachOwners: (() => void)[] = []
afterEach(() => {
  for (const detach of detachOwners.splice(0)) {
    detach()
  }
  vi.unstubAllGlobals()
  fixtureState.settings.activeRuntimeEnvironmentId = null
})

function apply(command: VoiceViewerOperation) {
  return applyVoiceViewerRequest({ id: 'fixture', expiresAt: Date.now() + 1000, command })
}

describe('voice viewer receiver', () => {
  it('enumerates only microphones and persists a selected physical device with read-back', async () => {
    vi.stubGlobal('document', { querySelector: () => ({}) })
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'fixture-mic', label: 'Fixture Mic' },
          { kind: 'audiooutput', deviceId: 'speaker', label: 'Speaker' }
        ])
      }
    })
    vi.stubGlobal('window', { api: { settings: { get: async () => fixtureState.settings } } })
    detachOwners.push(
      attachVoiceMicrophoneOwner({
        refresh: async () =>
          listVoiceMicrophoneDevices(await navigator.mediaDevices.enumerateDevices()),
        select: async (id) => {
          const devices = listVoiceMicrophoneDevices(
            await navigator.mediaDevices.enumerateDevices()
          )
          const match = devices.find((device) => device.deviceId === id)
          if (id && !match) {
            throw new Error('microphone_device_not_found')
          }
          fixtureState.settings.voice = {
            ...fixtureState.settings.voice,
            microphoneDeviceId: id,
            microphoneDeviceLabel: match?.label ?? null
          }
          return { deviceId: id, label: match?.label ?? null }
        },
        access: async () => true
      })
    )
    expect((await apply({ viewer: 'host', operation: 'microphones-list' })).devices).toEqual([
      { deviceId: 'fixture-mic', label: 'Fixture Mic' }
    ])
    const selected = await apply({
      viewer: 'host',
      operation: 'microphone-select',
      deviceId: 'fixture-mic'
    })
    expect(selected).toMatchObject({
      applied: true,
      persisted: true,
      microphoneDeviceId: 'fixture-mic'
    })
    expect(fixtureState.settings.voice.microphoneDeviceLabel).toBe('Fixture Mic')
    await expect(
      apply({ viewer: 'host', operation: 'microphone-select', deviceId: 'missing' })
    ).rejects.toThrow('device_not_found')
  })
  it('refuses a viewer displaying a remote runtime before enumerating local hardware', async () => {
    const enumerateDevices = vi.fn()
    vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices } })
    fixtureState.settings.activeRuntimeEnvironmentId = 'remote-fixture'
    await expect(apply({ viewer: 'host', operation: 'microphones-list' })).rejects.toThrow(
      'runtime_mismatch'
    )
    expect(enumerateDevices).not.toHaveBeenCalled()
  })
  it('refuses expired commands before requesting an OS permission', async () => {
    const getUserMedia = vi.fn()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    await expect(
      applyVoiceViewerRequest({
        id: 'expired',
        expiresAt: 0,
        command: { viewer: 'host', operation: 'microphone-request-start' }
      })
    ).rejects.toThrow('expired')
    expect(getUserMedia).not.toHaveBeenCalled()
  })
  it('reads back copied content without returning private cleanup payloads', async () => {
    let clipboard = ''
    Object.assign(fixtureState, {
      recordFeatureInteraction: vi.fn(async () => {}),
      openSettingsTarget: vi.fn(),
      openSettingsPage: vi.fn()
    })
    Object.assign(fixtureState.settings, { experimentalEphemeralVms: true })
    vi.stubGlobal('document', { querySelector: () => ({}) })
    vi.stubGlobal('window', {
      api: {
        ui: {
          writeClipboardText: async (text: string) => {
            clipboard = text
          },
          readClipboardText: async () => clipboard
        },
        ephemeralVm: {
          getCleanupCommand: async () => ({
            command: './destroy',
            payloadJson: 'fixture-provider-private'
          })
        }
      }
    })
    detachOwners.push(
      attachVmPaneRequest(async () => {
        await window.api.ui.writeClipboardText(EPHEMERAL_VM_SETUP_PROMPT)
        return (await window.api.ui.readClipboardText()) === EPHEMERAL_VM_SETUP_PROMPT
      })
    )
    expect(await apply({ viewer: 'host', operation: 'vm-copy-prompt' })).toMatchObject({
      applied: true,
      persisted: false
    })
    const detach = attachVmRuntimeViewerRequest(async () => {
      const value = await window.api.ephemeralVm.getCleanupCommand({ runtimeId: 'fixture' })
      const text = `${value.command}\n\n# Cleanup payload:\n${value.payloadJson}`
      await window.api.ui.writeClipboardText(text)
      return (await window.api.ui.readClipboardText()) === text
    })
    const result = await apply({
      viewer: 'host',
      operation: 'vm-copy-cleanup',
      runtimeId: 'fixture'
    })
    await vi.waitFor(() =>
      expect(
        result.operationId && readVmRuntimeViewerRequest(result.operationId).vmActionState
      ).toBe('succeeded')
    )
    detach()
    expect(clipboard).toContain('fixture-provider-private')
    expect(result).toMatchObject({ applied: true, persisted: false })
    expect(JSON.stringify(result)).not.toContain('fixture-provider-private')
  })
  it('does not close a replacement modal after the tip persistence acknowledgement', async () => {
    const closeModal = vi.fn()
    Object.assign(fixtureState, {
      activeModal: 'feature-tips',
      modalData: { tipId: 'voice-dictation' },
      featureTipsSeenIds: [],
      markFeatureTipsSeen: vi.fn(),
      closeModal
    })
    vi.stubGlobal('window', {
      api: {
        ui: {
          setWithAck: async () => {
            Reflect.set(fixtureState, 'activeModal', 'new-workspace-composer')
          }
        }
      }
    })
    await expect(apply({ viewer: 'host', operation: 'tip-close' })).rejects.toThrow(
      'voice_tip_changed'
    )
    expect(closeModal).not.toHaveBeenCalled()
  })
})
