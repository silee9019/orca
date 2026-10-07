import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultVoiceSettings } from '../../../shared/constants'
import type { VoiceSettings } from '../../../shared/speech-types'
import type { VoiceViewerOperation } from '../../../shared/voice-viewer'
import { applyVoiceViewerRequest } from './voice-viewer-bridge'

const fixtureState: {
  persistedUIReady: boolean
  settings: { activeRuntimeEnvironmentId: string | null; voice: VoiceSettings }
  updateSettingsOrThrow: (updates: { voice: VoiceSettings }) => Promise<void>
} = {
  persistedUIReady: true,
  settings: { activeRuntimeEnvironmentId: null, voice: getDefaultVoiceSettings() },
  updateSettingsOrThrow: async (updates: { voice: VoiceSettings }) => {
    fixtureState.settings.voice = updates.voice
  }
}
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixtureState } }))
afterEach(() => {
  vi.unstubAllGlobals()
  fixtureState.settings.activeRuntimeEnvironmentId = null
})

function apply(command: VoiceViewerOperation) {
  return applyVoiceViewerRequest({ id: 'fixture', expiresAt: Date.now() + 1000, command })
}

describe('voice viewer receiver', () => {
  it('enumerates only microphones and persists a selected physical device with read-back', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'fixture-mic', label: 'Fixture Mic' },
          { kind: 'audiooutput', deviceId: 'speaker', label: 'Speaker' }
        ])
      }
    })
    vi.stubGlobal('window', { api: { settings: { get: async () => fixtureState.settings } } })
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
    Object.assign(fixtureState, { recordFeatureInteraction: vi.fn(async () => {}) })
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
    expect(await apply({ viewer: 'host', operation: 'vm-copy-prompt' })).toMatchObject({
      applied: true,
      persisted: false
    })
    const result = await apply({
      viewer: 'host',
      operation: 'vm-copy-cleanup',
      runtimeId: 'fixture'
    })
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
