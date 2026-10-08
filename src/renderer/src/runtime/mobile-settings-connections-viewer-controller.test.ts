import { expect, it, vi } from 'vitest'
import {
  applyMobileSettingsConnectionsViewerRequest,
  mountMobileSettingsConnectionsViewerController,
  type MobileSettingsConnectionsViewerController
} from './mobile-settings-connections-viewer-controller'
import type { MobileSettingsConnectionsViewerState } from '../../../shared/connections-viewer'
it('does not acknowledge a stale mode snapshot changed during persistent readback', async () => {
  const state: MobileSettingsConnectionsViewerState = {
    connectionMode: 'automatic',
    selectedAddressSet: false,
    customCount: 0,
    networkCount: 0,
    refreshing: false,
    loading: false,
    pairingAvailable: false,
    relayFailed: false,
    qrEnlarged: false,
    autoRestoreFitMs: null,
    deviceCount: 0
  }
  const controller: MobileSettingsConnectionsViewerController = {
    read: () => ({ ...state }),
    canGenerate: () => false,
    pairingIdentity: () => null,
    mode: (value) => {
      state.connectionMode = value
    },
    address: () => false,
    customAdd: () => false,
    customRemove: () => false,
    matches: () => false,
    generate: vi.fn(),
    refresh: vi.fn(),
    enlarge: vi.fn(),
    autoRestore: vi.fn(),
    revoke: vi.fn(),
    hasDevice: () => false,
    copyDiagnostics: vi.fn(),
    persisted: async () => {
      state.connectionMode = 'automatic'
      return true
    }
  }
  const detach = mountMobileSettingsConnectionsViewerController(controller)
  try {
    expect(
      await applyMobileSettingsConnectionsViewerRequest({
        id: 'race',
        expiresAt: Date.now() + 40,
        command: { viewerId: 7, operation: 'mobile-settings.mode', value: 'local-only' }
      })
    ).toMatchObject({ applied: false, persisted: true, state: { connectionMode: 'automatic' } })
  } finally {
    detach()
  }
})
