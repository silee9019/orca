import { afterEach, expect, it } from 'vitest'
import {
  applyMobileConnectionsViewerRequest,
  mountMobileConnectionsViewerController
} from './mobile-connections-viewer-controller'
import type {
  ConnectionsViewerRequest,
  MobileConnectionsViewerState
} from '../../../shared/connections-viewer'
let detach: (() => void) | undefined
afterEach(() => {
  detach?.()
  detach = undefined
})
function fixture(canGenerate = true, initialFailure = false, insertCustom = true) {
  const state: MobileConnectionsViewerState = {
    platform: 'ios',
    iosChannel: 'stable',
    connectionMode: 'local-only',
    selectedAddress: null,
    customAddresses: [],
    stage: 'intro',
    step: 0,
    pairingAvailable: false,
    pairingLoading: false,
    relayFailed: initialFailure,
    deviceCount: 0
  }
  let pairing: string | null = null
  let failure: object | null = initialFailure ? {} : null
  const commit = (update: () => void): void => {
    queueMicrotask(update)
  }
  const mint = (): void => {
    commit(() => {
      state.pairingLoading = true
    })
    setTimeout(
      () =>
        commit(() => {
          pairing = `private-mint-canary-${pairing ?? ''}`
          state.pairingAvailable = true
          state.pairingLoading = false
          state.relayFailed = false
          failure = null
        }),
      16
    )
  }
  detach = mountMobileConnectionsViewerController({
    read: () => ({ ...state, customAddresses: [...state.customAddresses] }),
    pairingIdentity: () => pairing,
    relayFailureIdentity: () => failure,
    canGeneratePairing: () => canGenerate,
    setPlatform: (value) =>
      commit(() => {
        state.platform = value
      }),
    setIosChannel: (value) =>
      commit(() => {
        state.iosChannel = value
      }),
    setConnectionMode: (value) =>
      commit(() => {
        state.connectionMode = value
      }),
    selectAddress: (value) =>
      commit(() => {
        state.selectedAddress = value
      }),
    beforeCustomAddressChange: async () => true,
    addCustomAddress: (value) =>
      commit(() => {
        state.selectedAddress = value
        if (insertCustom) {
          state.customAddresses.push(value)
        }
      }),
    removeCustomAddress: (value) =>
      commit(() => {
        state.customAddresses = state.customAddresses.filter((address) => address !== value)
      }),
    start: () =>
      commit(() => {
        state.stage = 'flow'
        state.step = 0
      }),
    back: () =>
      commit(() => {
        state.step = 0
      }),
    continue: () =>
      commit(() => {
        state.step = 1
      }),
    done: () =>
      commit(() => {
        state.stage = 'paired'
      }),
    pairAnother: () =>
      commit(() => {
        state.stage = 'flow'
        state.step = 1
      }),
    useLan: () =>
      commit(() => {
        state.connectionMode = 'local-only'
      }),
    generate: mint,
    retryRelay: mint
  })
  return state
}
function request(command: ConnectionsViewerRequest['command']): ConnectionsViewerRequest {
  return { id: 'fixture', expiresAt: Date.now() + 200, command }
}
it('applies mobile platform, channel and flow through the existing committed controller state', async () => {
  fixture()
  for (const command of [
    { viewerId: 5, operation: 'mobile.platform', value: 'android' },
    { viewerId: 5, operation: 'mobile.ios-channel', value: 'preview' },
    { viewerId: 5, operation: 'mobile.start' },
    { viewerId: 5, operation: 'mobile.continue' }
  ] as const) {
    const result = await applyMobileConnectionsViewerRequest(request(command))
    expect(result.applied).toBe(true)
    expect(result.persisted).toBeNull()
  }
})
it('observes custom address insertion and removal after the precondition resolves', async () => {
  fixture()
  const added = await applyMobileConnectionsViewerRequest(
    request({ viewerId: 5, operation: 'mobile.custom-add', value: '192.168.1.2' })
  )
  expect(added.state.customAddresses).toEqual(['192.168.1.2'])
  const removed = await applyMobileConnectionsViewerRequest(
    request({ viewerId: 5, operation: 'mobile.custom-remove', value: '192.168.1.2' })
  )
  expect(removed.state.customAddresses).toEqual([])
})
it('requires a newly applied pairing and never returns its private URL', async () => {
  fixture()
  for (const operation of ['mobile.generate', 'mobile.retry-relay'] as const) {
    const result = await applyMobileConnectionsViewerRequest(request({ viewerId: 5, operation }))
    expect(result).toMatchObject({ applied: true, state: { pairingAvailable: true } })
    expect(JSON.stringify(result)).not.toContain('private-mint-canary')
  }
  detach?.()
  detach = undefined
  fixture(false)
  await expect(
    applyMobileConnectionsViewerRequest(request({ viewerId: 5, operation: 'mobile.generate' }))
  ).rejects.toThrow('pairing_generation_unavailable')
})
it('does not claim paired completion without an observed paired device', async () => {
  fixture()
  await expect(
    applyMobileConnectionsViewerRequest(request({ viewerId: 5, operation: 'mobile.done' }))
  ).rejects.toThrow('paired_device_required')
})

it('waits for the new retry commit instead of treating the previous failure as its result', async () => {
  fixture(true, true)
  const result = await applyMobileConnectionsViewerRequest(
    request({ viewerId: 5, operation: 'mobile.retry-relay' })
  )
  expect(result).toMatchObject({
    applied: true,
    state: { relayFailed: false, pairingAvailable: true }
  })
})
it('does not ack a custom address when only selection changed but insertion did not commit', async () => {
  fixture(true, false, false)
  const result = await applyMobileConnectionsViewerRequest(
    request({ viewerId: 5, operation: 'mobile.custom-add', value: '192.168.1.2' })
  )
  expect(result.applied).toBe(false)
})
