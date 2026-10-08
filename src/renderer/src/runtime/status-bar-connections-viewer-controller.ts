import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { StatusBarConnectionsViewerParams } from '../../../shared/rpc-contract/status-bar-connections-viewer-params'
import type {
  StatusBarConnectionsViewerResult,
  StatusBarConnectionsViewerState
} from '../../../shared/status-bar-connections-viewer'
export type StatusBarConnectionsViewerController = {
  surface: 'hosts' | 'visibility'
  read: (environmentId?: string) => StatusBarConnectionsViewerState
  disclosure?: (open: boolean) => Promise<boolean>
  manage?: () => boolean
  connect?: (id: string) => Promise<boolean>
  disconnect?: (id: string) => Promise<boolean>
  setVisible?: (value: boolean) => boolean
  persisted?: (value: boolean) => Promise<boolean>
}
const controllers = new Set<StatusBarConnectionsViewerController>()
export function mountStatusBarConnectionsViewerController(
  controller: StatusBarConnectionsViewerController
): () => void {
  controllers.add(controller)
  return () => {
    controllers.delete(controller)
  }
}
export async function applyStatusBarConnectionsViewerRequest(request: {
  id: string
  expiresAt: number
  command: unknown
}): Promise<StatusBarConnectionsViewerResult> {
  const parsed = StatusBarConnectionsViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  const command = parsed.data
  const surface = command.operation === 'status-bar.ssh-visible' ? 'visibility' : 'hosts'
  const matches = [...controllers].filter((owner) => owner.surface === surface)
  if (matches.length > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const owner = matches[0]
  if (!owner) {
    throw new Error('connections_surface_unavailable')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  let complete = false,
    persisted: boolean | null = null
  const id = 'environmentId' in command ? command.environmentId : undefined
  if (
    id &&
    'expectedHostId' in command &&
    command.expectedHostId !== toRuntimeExecutionHostId(id)
  ) {
    throw new Error('confirm_target_mismatch')
  }
  switch (command.operation) {
    case 'status-bar.disclosure':
      complete = (await owner.disclosure?.(command.open)) ?? false
      break
    case 'status-bar.manage':
      complete = owner.manage?.() ?? false
      break
    case 'status-bar.runtime-connect':
      complete = (await owner.connect?.(command.environmentId)) ?? false
      break
    case 'status-bar.runtime-disconnect':
      if (command.confirmTarget !== command.environmentId) {
        throw new Error('confirm_target_mismatch')
      }
      complete = (await owner.disconnect?.(command.environmentId)) ?? false
      break
    case 'status-bar.ssh-visible':
      complete = owner.setVisible?.(command.value) ?? false
      persisted = false
      break
  }
  while (Date.now() < request.expiresAt && controllers.has(owner)) {
    const state = owner.read(id)
    let applied = false
    switch (command.operation) {
      case 'status-bar.disclosure':
        applied = state.open === command.open
        break
      case 'status-bar.manage':
        applied = state.settingsOpen === true
        break
      case 'status-bar.runtime-connect':
        applied = state.environmentId === id && state.runtimeState === 'connected'
        break
      case 'status-bar.runtime-disconnect':
        applied = state.environmentId === id && state.runtimeState === 'disconnected'
        break
      case 'status-bar.ssh-visible':
        applied = state.sshVisible === command.value
        break
    }
    applied = complete && applied
    if (applied || !complete) {
      if (applied && command.operation === 'status-bar.ssh-visible') {
        persisted = (await owner.persisted?.(command.value)) ?? false
        if (!controllers.has(owner)) {
          throw new Error('connections_surface_unavailable')
        }
        if (Date.now() >= request.expiresAt) {
          throw new Error('request_expired')
        }
        applied = owner.read().sshVisible === command.value
      }
      return {
        viewerId: command.viewerId,
        applied,
        persisted,
        state: { statusBar: owner.read(id) },
        ...(!applied ? { reason: 'status_bar_action_not_applied' } : {})
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16))
  }
  throw new Error(controllers.has(owner) ? 'request_expired' : 'connections_surface_unavailable')
}
