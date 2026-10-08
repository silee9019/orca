import { applyHostRequest } from './ssh-workspace-host-viewer-request'
import type { ConnectionsViewerRequest } from '../../../shared/connections-viewer'
import type {
  SshWorkspaceRemovalViewerState,
  SshConfirmationViewerResult
} from '../../../shared/ssh-confirmation-viewer'
import {
  type SshHostViewerCommand,
  SshWorkspaceConnectionsViewerParams
} from '../../../shared/rpc-contract/ssh-confirmation-viewer-params'
export type SshWorkspaceRemovalViewerController = {
  read: () => SshWorkspaceRemovalViewerState
  forget: () => Promise<boolean>
  reconnectDelete: () => Promise<boolean>
  cancel: () => boolean
}
const workspaceRemovals = new Set<SshWorkspaceRemovalViewerController>()
export function mountSshWorkspaceRemovalViewerController(
  controller: SshWorkspaceRemovalViewerController
): () => void {
  workspaceRemovals.add(controller)
  return () => {
    workspaceRemovals.delete(controller)
  }
}
export type SshWorkspaceOverlayViewerController = {
  read: () => {
    workspaceId: string | null
    surface?: SshHostViewerCommand['surface']
    canSelect?: boolean
    selected?: boolean
    canDisconnect?: boolean
    targetId: string
    expectedHostId: string
    removed: boolean
    canConnect: boolean
    connected: boolean
  }
  connect: () => Promise<boolean>
  request?: () => boolean
  select?: () => boolean
  disconnect?: () => Promise<boolean>
  readRequestedConfirmation?: () => SshWorkspaceRemovalViewerState | null
}
const workspaceOverlays = new Set<SshWorkspaceOverlayViewerController>()
export function mountSshWorkspaceOverlayViewerController(
  controller: SshWorkspaceOverlayViewerController
): () => void {
  workspaceOverlays.add(controller)
  return () => {
    workspaceOverlays.delete(controller)
  }
}
async function applyWorkspaceOverlayRequest(
  command: {
    viewerId: number
    operation: 'ssh-workspace.connect' | 'ssh-workspace.request'
    workspaceId: string
    targetId: string
    expectedHostId: string
  },
  expiresAt: number
): Promise<SshConfirmationViewerResult> {
  const matching = [...workspaceOverlays].filter((entry) => {
    const scope = entry.read()
    return (
      scope.workspaceId === command.workspaceId &&
      scope.targetId === command.targetId &&
      scope.expectedHostId === command.expectedHostId
    )
  })
  if (matching.length > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const controller = matching[0]
  if (!controller) {
    throw new Error('connections_surface_unavailable')
  }
  const initial = controller.read()
  if (Date.now() >= expiresAt) {
    throw new Error('request_expired')
  }
  if (
    command.operation === 'ssh-workspace.connect'
      ? initial.removed || !initial.canConnect
      : !initial.removed
  ) {
    throw new Error('ssh_workspace_action_unavailable')
  }
  const completed =
    command.operation === 'ssh-workspace.connect'
      ? await controller.connect()
      : (controller.request?.() ?? false)
  while (Date.now() < expiresAt && workspaceOverlays.has(controller)) {
    const scope = controller.read()
    if (
      scope.workspaceId !== command.workspaceId ||
      scope.targetId !== command.targetId ||
      scope.expectedHostId !== command.expectedHostId
    ) {
      throw new Error('confirm_target_mismatch')
    }
    const dialogs = [...workspaceRemovals]
      .map((entry) => entry.read())
      .filter(
        (state) =>
          state.dialogOpen &&
          state.workspaceId === command.workspaceId &&
          state.targetId === command.targetId &&
          state.expectedHostId === command.expectedHostId
      )
    if (dialogs.length > 1) {
      throw new Error('connections_viewer_ambiguous')
    }
    const state = dialogs[0] ??
      controller.readRequestedConfirmation?.() ?? {
        workspaceId: command.workspaceId,
        expectedHostId: command.expectedHostId,
        targetId: command.targetId,
        dialogOpen: false,
        canReconnect: scope.canConnect,
        busy: false
      }
    const applied =
      completed &&
      (command.operation === 'ssh-workspace.connect' ? scope.connected : state.dialogOpen)
    if (applied || !completed) {
      return {
        viewerId: command.viewerId,
        persisted: null,
        applied,
        termination: null,
        state: {
          resetTargetId: null,
          terminateTargetId: null,
          busy: false,
          workspaceForget: state
        },
        ...(!applied ? { reason: 'ssh_workspace_action_not_applied' } : {})
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16))
  }
  throw new Error(
    workspaceOverlays.has(controller) ? 'request_expired' : 'connections_surface_unavailable'
  )
}
export async function applySshWorkspaceRemovalViewerRequest(
  request: ConnectionsViewerRequest
): Promise<SshConfirmationViewerResult> {
  const parsed = SshWorkspaceConnectionsViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  const command = parsed.data
  if (
    command.operation === 'ssh-workspace.host-select' ||
    command.operation === 'ssh-workspace.host-connect' ||
    command.operation === 'ssh-workspace.host-disconnect'
  ) {
    return applyHostRequest(command, request.expiresAt, workspaceOverlays)
  }
  if (
    command.operation === 'ssh-workspace.connect' ||
    command.operation === 'ssh-workspace.request'
  ) {
    return applyWorkspaceOverlayRequest(command, request.expiresAt)
  }
  if (workspaceRemovals.size > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const controller = workspaceRemovals.values().next().value
  if (!controller) {
    throw new Error('connections_surface_unavailable')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const initial = controller.read()
  if (
    !initial.dialogOpen ||
    initial.workspaceId !== command.workspaceId ||
    initial.targetId !== command.targetId ||
    (command.expectedHostId !== undefined && initial.expectedHostId !== command.expectedHostId) ||
    (initial.expectedHostId?.startsWith('runtime:') &&
      command.expectedHostId !== initial.expectedHostId)
  ) {
    throw new Error('confirm_target_mismatch')
  }
  if (initial.busy && command.operation !== 'ssh-workspace.get') {
    throw new Error('ssh_action_in_progress')
  }
  let completed = true
  switch (command.operation) {
    case 'ssh-workspace.get':
      break
    case 'ssh-workspace.cancel':
      completed = controller.cancel()
      break
    case 'ssh-workspace.forget-local':
    case 'ssh-workspace.reconnect-delete':
      if (command.confirmTarget !== command.workspaceId) {
        throw new Error('confirm_target_mismatch')
      }
      if (command.operation === 'ssh-workspace.reconnect-delete' && !initial.canReconnect) {
        throw new Error('ssh_reconnect_unavailable')
      }
      completed = await (command.operation === 'ssh-workspace.forget-local'
        ? controller.forget()
        : controller.reconnectDelete())
      break
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const current = controller.read()
  const intendedClose =
    command.operation !== 'ssh-workspace.get' && !current.dialogOpen && workspaceRemovals.size === 0
  if ((!workspaceRemovals.has(controller) || workspaceRemovals.size !== 1) && !intendedClose) {
    throw new Error('connections_surface_unavailable')
  }
  const applied =
    command.operation === 'ssh-workspace.get' || (completed && !current.dialogOpen && !current.busy)
  return {
    viewerId: command.viewerId,
    persisted: null,
    applied,
    termination: null,
    state: {
      resetTargetId: null,
      terminateTargetId: null,
      removeTargetId: null,
      busy: current.busy,
      workspaceForget: current
    },
    ...(!applied ? { reason: 'ssh_workspace_action_not_applied' } : {})
  }
}
