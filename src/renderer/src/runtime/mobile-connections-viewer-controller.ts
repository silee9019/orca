import {
  performMobilePageViewerAction,
  type MobilePageViewerActions
} from './mobile-page-viewer-actions'
import type {
  ConnectionsViewerRequest,
  MobileConnectionsViewerResult,
  MobileConnectionsViewerState
} from '../../../shared/connections-viewer'
import { MobileConnectionsViewerParams } from '../../../shared/rpc-contract/connections-viewer-params'
export type MobileConnectionsViewerController = MobilePageViewerActions & {
  hasDevice?: (id: string) => boolean
  isRevokingDevice?: (id: string) => boolean
  revokeDevice?: (id: string) => Promise<boolean | void>
  read: () => MobileConnectionsViewerState
  pairingIdentity: () => string | null
  relayFailureIdentity: () => object | null
  canGeneratePairing: () => boolean
  setPlatform: (value: 'ios' | 'android') => void
  setIosChannel: (value: 'stable' | 'preview') => void
  setConnectionMode: (value: 'automatic' | 'local-only') => void
  selectAddress: (value: string) => void
  beforeCustomAddressChange: (value: string) => Promise<boolean>
  addCustomAddress: (value: string) => void
  removeCustomAddress: (value: string) => void
  start: () => void
  back: () => void
  continue: () => void
  done: (count: number) => void
  pairAnother: () => void
  useLan: () => void
  generate: () => void
  retryRelay: () => void
}
let mountedController: MobileConnectionsViewerController | null = null
export function mountMobileConnectionsViewerController(
  controller: MobileConnectionsViewerController
): () => void {
  if (mountedController) {
    throw new Error('connections_viewer_ambiguous')
  }
  mountedController = controller
  return () => {
    if (mountedController === controller) {
      mountedController = null
    }
  }
}
export async function applyMobileConnectionsViewerRequest(
  request: ConnectionsViewerRequest
): Promise<MobileConnectionsViewerResult> {
  const parsed = MobileConnectionsViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  const command = parsed.data
  if (!command.operation.startsWith('mobile.')) {
    throw new Error('connections_surface_mismatch')
  }
  const controller = mountedController
  if (!controller) {
    throw new Error('connections_surface_unavailable')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const initial = controller.read()
  const expected: Partial<MobileConnectionsViewerState> = {}
  const pairingIdentity = controller.pairingIdentity()
  const previousFailure = controller.relayFailureIdentity()
  let generationObserved = false
  let mint = false
  switch (command.operation) {
    case 'mobile.revoke-device': {
      if (!controller.revokeDevice || !controller.hasDevice) {
        throw new Error('connections_surface_unavailable')
      }
      if (!controller.hasDevice(command.confirmDevice)) {
        throw new Error('mobile_device_not_found')
      }
      if (controller.isRevokingDevice?.(command.confirmDevice)) {
        throw new Error('mobile_device_revoke_in_progress')
      }
      const revoked = (await controller.revokeDevice(command.confirmDevice)) === true
      while (
        revoked &&
        controller.hasDevice(command.confirmDevice) &&
        mountedController === controller &&
        Date.now() < request.expiresAt
      ) {
        await new Promise((resolve) => setTimeout(resolve, 16))
      }
      if (mountedController !== controller || Date.now() >= request.expiresAt) {
        throw new Error('request_expired')
      }
      return {
        viewerId: command.viewerId,
        persisted: null,
        applied: revoked && !controller.hasDevice(command.confirmDevice),
        state: controller.read()
      }
    }
    case 'mobile.copy-pairing':
    case 'mobile.copy-install':
    case 'mobile.open-install':
    case 'mobile.open-android-guide':
    case 'mobile.copy-diagnostics':
    case 'mobile.refresh-network':
    case 'mobile.close':
    case 'mobile.sidebar-toggle': {
      const result = await performMobilePageViewerAction(
        controller,
        command.operation,
        request.expiresAt,
        () => mountedController === controller
      )
      return {
        viewerId: command.viewerId,
        applied: result.applied,
        persisted: result.persisted,
        state: { ...controller.read(), ...(result.closed ? { pageOpen: false } : {}) }
      }
    }
    case 'mobile.get':
      break
    case 'mobile.platform':
      controller.setPlatform(command.value)
      expected.platform = command.value
      break
    case 'mobile.ios-channel':
      controller.setIosChannel(command.value)
      expected.iosChannel = command.value
      break
    case 'mobile.connection-mode':
      controller.setConnectionMode(command.value)
      expected.connectionMode = command.value
      break
    case 'mobile.address':
      controller.selectAddress(command.value)
      expected.selectedAddress = command.value
      break
    case 'mobile.custom-add':
      if (!(await controller.beforeCustomAddressChange(command.value))) {
        throw new Error('custom_address_change_refused')
      }
      if (mountedController !== controller || Date.now() >= request.expiresAt) {
        throw new Error('request_expired')
      }
      controller.addCustomAddress(command.value)
      expected.selectedAddress = command.value
      break
    case 'mobile.custom-remove':
      controller.removeCustomAddress(command.value)
      break
    case 'mobile.start':
      controller.start()
      expected.stage = 'flow'
      expected.step = 0
      break
    case 'mobile.back':
      controller.back()
      if (initial.step === 1) {
        expected.step = 0
      } else {
        expected.stage = initial.deviceCount > 0 ? 'paired' : 'intro'
      }
      break
    case 'mobile.continue':
      controller.continue()
      expected.step = 1
      break
    case 'mobile.done':
      if (initial.deviceCount === 0) {
        throw new Error('paired_device_required')
      }
      controller.done(initial.deviceCount)
      expected.stage = 'paired'
      break
    case 'mobile.pair-another':
      controller.pairAnother()
      expected.stage = 'flow'
      expected.step = 1
      break
    case 'mobile.use-lan':
      controller.useLan()
      expected.connectionMode = 'local-only'
      break
    case 'mobile.generate':
    case 'mobile.retry-relay':
      if (!controller.canGeneratePairing()) {
        throw new Error('pairing_generation_unavailable')
      }
      mint = true
      if (command.operation === 'mobile.generate') {
        controller.generate()
      } else {
        controller.retryRelay()
      }
      break
  }
  while (Date.now() < request.expiresAt && mountedController === controller) {
    const state = controller.read()
    const matches = Object.entries(expected).every(
      ([key, value]) => Reflect.get(state, key) === value
    )
    const customApplied =
      command.operation === 'mobile.custom-remove'
        ? !state.customAddresses.includes(command.value)
        : command.operation === 'mobile.custom-add'
          ? state.customAddresses.includes(command.value)
          : true
    const mintApplied =
      !mint ||
      (!state.pairingLoading &&
        state.pairingAvailable &&
        controller.pairingIdentity() !== pairingIdentity)
    if (matches && customApplied && mintApplied) {
      return { viewerId: command.viewerId, persisted: null, applied: true, state }
    }
    generationObserved ||=
      state.pairingLoading ||
      controller.pairingIdentity() !== pairingIdentity ||
      controller.relayFailureIdentity() !== previousFailure
    if (mint && generationObserved && !state.pairingLoading && state.relayFailed) {
      throw new Error('pairing_generation_failed')
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16))
  }
  if (mountedController !== controller) {
    throw new Error('connections_surface_unavailable')
  }
  return {
    viewerId: command.viewerId,
    persisted: null,
    applied: false,
    state: controller.read(),
    reason: 'viewer_not_applied'
  }
}
