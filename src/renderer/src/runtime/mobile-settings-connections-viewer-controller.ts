import type {
  ConnectionsViewerRequest,
  MobileSettingsConnectionsViewerResult,
  MobileSettingsConnectionsViewerState
} from '../../../shared/connections-viewer'
import { MobileSettingsConnectionsViewerParams } from '../../../shared/rpc-contract/connections-viewer-params'
import { AUTO_RESTORE_FIT_OPTIONS } from '@/components/settings/mobile-auto-restore-options'
export type MobileSettingsConnectionsViewerController = {
  read: () => MobileSettingsConnectionsViewerState
  canGenerate: () => boolean
  pairingIdentity: () => string | null
  mode: (value: 'automatic' | 'local-only') => void
  address: (value: string) => boolean
  customAdd: (value: string) => boolean
  customRemove: (value: string) => boolean
  matches: (kind: 'address' | 'custom-add' | 'custom-remove', value: string) => boolean
  generate: (rotate: boolean) => Promise<void>
  refresh: () => Promise<boolean>
  enlarge: (open: boolean) => void
  autoRestore: (ms: number | null) => Promise<void>
  revoke: (deviceId: string) => Promise<void>
  hasDevice: (deviceId: string) => boolean
  copyDiagnostics: () => Promise<boolean>
  persisted: (kind: 'mode' | 'auto-restore', value: string | number | null) => Promise<boolean>
}
type PairingClipboard = { pairingIdentity: () => string | null; copy: () => Promise<boolean> }
const pairingClipboards = new Set<PairingClipboard>()
export function mountMobileSettingsPairingClipboard(owner: PairingClipboard): () => void {
  pairingClipboards.add(owner)
  return () => {
    pairingClipboards.delete(owner)
  }
}
let mounted: MobileSettingsConnectionsViewerController | null = null
export function mountMobileSettingsConnectionsViewerController(
  controller: MobileSettingsConnectionsViewerController
): () => void {
  if (mounted) {
    throw new Error('connections_viewer_ambiguous')
  }
  mounted = controller
  return () => {
    if (mounted === controller) {
      mounted = null
    }
  }
}
export async function applyMobileSettingsConnectionsViewerRequest(
  request: ConnectionsViewerRequest
): Promise<MobileSettingsConnectionsViewerResult> {
  const parsed = MobileSettingsConnectionsViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const controller = mounted
  if (!controller) {
    throw new Error('connections_surface_unavailable')
  }
  const command = parsed.data
  const initial = controller.read()
  const expected: Partial<MobileSettingsConnectionsViewerState> = {}
  let matches = (): boolean => true
  let persisted: boolean | null = null
  let persistence: (() => Promise<boolean>) | null = null
  switch (command.operation) {
    case 'mobile-settings.get':
      break
    case 'mobile-settings.copy-pairing': {
      const clipboard = pairingClipboards.values().next().value
      if (
        pairingClipboards.size !== 1 ||
        !clipboard ||
        !clipboard.pairingIdentity() ||
        clipboard.pairingIdentity() !== controller.pairingIdentity()
      ) {
        throw new Error('mobile_pairing_unavailable')
      }
      const identity = clipboard.pairingIdentity()
      if (
        !(await clipboard.copy()) ||
        !pairingClipboards.has(clipboard) ||
        clipboard.pairingIdentity() !== identity ||
        controller.pairingIdentity() !== identity
      ) {
        throw new Error('clipboard_write_unconfirmed')
      }
      break
    }
    case 'mobile-settings.mode':
      controller.mode(command.value)
      expected.connectionMode = command.value
      persistence = () => controller.persisted('mode', command.value)
      break
    case 'mobile-settings.address':
    case 'mobile-settings.custom-add':
    case 'mobile-settings.custom-remove': {
      const kind =
        command.operation === 'mobile-settings.address'
          ? 'address'
          : command.operation === 'mobile-settings.custom-add'
            ? 'custom-add'
            : 'custom-remove'
      const accepted =
        kind === 'address'
          ? controller.address(command.value)
          : kind === 'custom-add'
            ? controller.customAdd(command.value)
            : controller.customRemove(command.value)
      if (!accepted) {
        throw new Error('address_option_unavailable')
      }
      matches = () => controller.matches(kind, command.value)
      break
    }
    case 'mobile-settings.generate':
    case 'mobile-settings.retry': {
      if (!controller.canGenerate() || initial.loading) {
        throw new Error('mobile_pairing_unavailable')
      }
      const previous = controller.pairingIdentity()
      await controller.generate(
        command.operation === 'mobile-settings.retry' || initial.pairingAvailable
      )
      expected.pairingAvailable = true
      expected.loading = false
      matches = () =>
        controller.pairingIdentity() !== null && controller.pairingIdentity() !== previous
      break
    }
    case 'mobile-settings.refresh':
      if (!(await controller.refresh())) {
        throw new Error('network_refresh_failed')
      }
      expected.refreshing = false
      break
    case 'mobile-settings.qr-enlarge':
      if (command.open && !initial.pairingAvailable) {
        throw new Error('mobile_pairing_unavailable')
      }
      controller.enlarge(command.open)
      expected.qrEnlarged = command.open
      break
    case 'mobile-settings.auto-restore': {
      const option = AUTO_RESTORE_FIT_OPTIONS.find((entry) => entry.value === command.value)
      if (!option) {
        throw new Error('invalid_auto_restore_value')
      }
      await controller.autoRestore(option.ms)
      expected.autoRestoreFitMs = option.ms
      persistence = () => controller.persisted('auto-restore', option.ms)
      break
    }
    case 'mobile-settings.revoke':
      if (command.deviceId !== command.confirmTarget) {
        throw new Error('confirm_target_mismatch')
      }
      if (!controller.hasDevice(command.deviceId)) {
        throw new Error('mobile_device_not_found')
      }
      await controller.revoke(command.deviceId)
      matches = () => !controller.hasDevice(command.deviceId)
      break
    case 'mobile-settings.copy-diagnostics':
      if (!initial.relayFailed || !(await controller.copyDiagnostics())) {
        throw new Error('clipboard_write_unconfirmed')
      }
      break
  }
  if (persistence) {
    persisted = false
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  while (Date.now() < request.expiresAt && mounted === controller) {
    let state = controller.read()
    if (
      matches() &&
      Object.entries(expected).every(([key, value]) => Reflect.get(state, key) === value)
    ) {
      persisted = persistence ? await persistence().catch(() => false) : null
      state = controller.read()
      if (
        persisted !== false &&
        Date.now() < request.expiresAt &&
        mounted === controller &&
        matches() &&
        Object.entries(expected).every(([key, value]) => Reflect.get(state, key) === value)
      ) {
        return { viewerId: command.viewerId, persisted, applied: true, state }
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16))
  }
  return {
    viewerId: command.viewerId,
    persisted,
    applied: false,
    state: controller.read(),
    reason: 'viewer_not_applied'
  }
}
