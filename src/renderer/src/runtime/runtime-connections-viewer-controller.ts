import { LOCAL_RUNTIME_VALUE } from '@/components/settings/runtime-environment-selection'
import type {
  ConnectionsViewerRequest,
  RuntimeConnectionsViewerResult,
  RuntimeConnectionsViewerState
} from '../../../shared/connections-viewer'
import { RuntimeConnectionsViewerParams } from '../../../shared/rpc-contract/connections-viewer-params'
export type RuntimeConnectionsViewerController = {
  read: () => RuntimeConnectionsViewerState
  matchesPairingCode: (value: string) => boolean
  hasEnvironment: (id: string | null) => boolean
  useEnvironment: (id: string | null) => Promise<boolean>
  setWorkflow: (value: RuntimeConnectionsViewerState['workflow']) => void
  setAddFormOpen: (value: boolean) => void
  setShareFormOpen: (value: boolean) => void
  setAdvancedOpen: (value: boolean) => void
  setName: (value: string) => void
  setPairingCode: (value: string) => void
  cancelAdd: () => void
  profile?: {
    select: (id: string | null) => Promise<boolean>
    persisted: (id: string | null) => Promise<boolean>
    request: (id: string | null) => void
    confirm: () => Promise<boolean>
    cancel: () => void
  }
}
let mountedController: RuntimeConnectionsViewerController | null = null
export function mountRuntimeConnectionsViewerController(
  controller: RuntimeConnectionsViewerController
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
export async function applyRuntimeConnectionsViewerRequest(
  request: ConnectionsViewerRequest
): Promise<RuntimeConnectionsViewerResult> {
  const parsed = RuntimeConnectionsViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  const command = parsed.data
  if (!command.operation.startsWith('runtime.')) {
    throw new Error('connections_surface_mismatch')
  }
  const controller = mountedController
  if (!controller) {
    throw new Error('connections_surface_unavailable')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const expected = { ...controller.read() }
  let persisted: boolean | null = null
  let persistence: (() => Promise<boolean>) | null = null
  switch (command.operation) {
    case 'runtime.profile-use': {
      const profile = controller.profile
      if (!profile) {
        throw new Error('profile_selection_unavailable')
      }
      if (command.confirmTarget !== (command.environmentId ?? LOCAL_RUNTIME_VALUE)) {
        throw new Error('confirm_target_mismatch')
      }
      if (!controller.hasEnvironment(command.environmentId)) {
        throw new Error('environment_not_found')
      }
      persisted = false
      if (!(await profile.select(command.environmentId))) {
        return {
          viewerId: command.viewerId,
          persisted,
          applied: false,
          state: controller.read(),
          reason: 'profile_selection_refused'
        }
      }
      expected.environmentId = command.environmentId
      persistence = () => profile.persisted(command.environmentId)
      break
    }
    case 'runtime.switch-request':
      if (!controller.profile) {
        throw new Error('profile_selection_unavailable')
      }
      if (!controller.hasEnvironment(command.environmentId)) {
        throw new Error('environment_not_found')
      }
      controller.profile.request(command.environmentId)
      expected.pendingSwitchValue = command.environmentId ?? LOCAL_RUNTIME_VALUE
      break
    case 'runtime.switch-confirm': {
      const profile = controller.profile
      const pending = controller.read().pendingSwitchValue
      if (!profile || !pending) {
        throw new Error('switch_confirmation_unavailable')
      }
      if (command.confirmTarget !== pending) {
        throw new Error('confirm_target_mismatch')
      }
      const id = pending === LOCAL_RUNTIME_VALUE ? null : pending
      persisted = false
      if (!(await profile.confirm())) {
        return {
          viewerId: command.viewerId,
          persisted,
          applied: false,
          state: controller.read(),
          reason: 'profile_selection_refused'
        }
      }
      expected.environmentId = id
      expected.pendingSwitchValue = null
      persistence = () => profile.persisted(id)
      break
    }
    case 'runtime.switch-cancel':
      if (!controller.profile) {
        throw new Error('profile_selection_unavailable')
      }
      controller.profile.cancel()
      expected.pendingSwitchValue = null
      break
    case 'runtime.get':
      break
    case 'runtime.use':
      if (!controller.hasEnvironment(command.environmentId)) {
        throw new Error('environment_not_found')
      }
      if (!(await controller.useEnvironment(command.environmentId))) {
        return {
          viewerId: command.viewerId,
          persisted: null,
          applied: false,
          state: controller.read(),
          reason: 'viewer_selection_refused'
        }
      }
      expected.environmentId = command.environmentId
      break
    case 'runtime.workflow':
      controller.setWorkflow(command.value)
      expected.workflow = command.value
      break
    case 'runtime.add-form':
      controller.setAddFormOpen(command.open)
      expected.addFormOpen = command.open
      break
    case 'runtime.share-form':
      controller.setShareFormOpen(command.open)
      expected.shareFormOpen = command.open
      break
    case 'runtime.advanced':
      controller.setAdvancedOpen(command.open)
      expected.advancedOpen = command.open
      break
    case 'runtime.draft-name':
      controller.setName(command.value)
      expected.name = command.value
      break
    case 'runtime.draft-pairing':
      controller.setPairingCode(command.value)
      expected.pairingCodeSet = command.value.length > 0
      break
    case 'runtime.cancel-add':
      controller.cancelAdd()
      expected.addFormOpen = false
      expected.name = ''
      expected.pairingCodeSet = false
      break
  }
  while (Date.now() < request.expiresAt && mountedController === controller) {
    let state = controller.read()
    if (
      JSON.stringify(state) === JSON.stringify(expected) &&
      (command.operation !== 'runtime.draft-pairing' ||
        controller.matchesPairingCode(command.value))
    ) {
      persisted = persistence ? await persistence().catch(() => false) : null
      state = controller.read()
      if (
        persisted !== false &&
        Date.now() < request.expiresAt &&
        mountedController === controller &&
        JSON.stringify(state) === JSON.stringify(expected)
      ) {
        return { viewerId: command.viewerId, persisted, applied: true, state }
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16))
  }
  if (mountedController !== controller) {
    throw new Error('connections_surface_unavailable')
  }
  return {
    viewerId: command.viewerId,
    persisted,
    applied: false,
    state: controller.read(),
    reason: 'viewer_not_applied'
  }
}
