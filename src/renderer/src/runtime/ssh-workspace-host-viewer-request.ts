import type { SshHostViewerCommand } from '../../../shared/rpc-contract/ssh-confirmation-viewer-params'
import type { SshConfirmationViewerResult } from '../../../shared/ssh-confirmation-viewer'
import type { SshWorkspaceOverlayViewerController } from './ssh-workspace-viewer-controller'

export async function applyHostRequest(
  command: SshHostViewerCommand,
  expiresAt: number,
  workspaceOverlays: Set<SshWorkspaceOverlayViewerController>
): Promise<SshConfirmationViewerResult> {
  const matches = [...workspaceOverlays].filter((entry) => {
    const state = entry.read()
    return (
      state.surface === command.surface &&
      state.targetId === command.targetId &&
      state.expectedHostId === command.expectedHostId &&
      (command.workspaceId === undefined || state.workspaceId === command.workspaceId)
    )
  })
  if (matches.length > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const controller = matches[0]
  if (!controller) {
    throw new Error('connections_surface_unavailable')
  }
  if (Date.now() >= expiresAt) {
    throw new Error('request_expired')
  }
  const initial = controller.read()
  let completed: boolean
  if (command.operation === 'ssh-workspace.host-connect') {
    if (initial.removed || !initial.canConnect) {
      throw new Error('ssh_host_action_unavailable')
    }
    completed = await controller.connect()
  } else if (command.operation === 'ssh-workspace.host-select') {
    if (!initial.canSelect || !controller.select) {
      throw new Error('ssh_host_action_unavailable')
    }
    completed = controller.select()
  } else {
    if (command.confirmTarget !== command.targetId) {
      throw new Error('confirm_target_mismatch')
    }
    if (!initial.canDisconnect || !controller.disconnect) {
      throw new Error('ssh_host_action_unavailable')
    }
    completed = await controller.disconnect()
  }
  while (Date.now() < expiresAt && workspaceOverlays.has(controller)) {
    const state = controller.read()
    if (
      state.surface !== command.surface ||
      state.targetId !== command.targetId ||
      state.expectedHostId !== command.expectedHostId ||
      (command.workspaceId !== undefined && state.workspaceId !== command.workspaceId)
    ) {
      throw new Error('confirm_target_mismatch')
    }
    const applied =
      completed &&
      (command.operation === 'ssh-workspace.host-connect'
        ? state.connected
        : command.operation === 'ssh-workspace.host-select'
          ? state.selected === true
          : !state.connected)
    if (applied || !completed) {
      return {
        viewerId: command.viewerId,
        applied,
        persisted: null,
        termination: null,
        state: {
          resetTargetId: null,
          terminateTargetId: null,
          busy: false,
          workspaceForget: {
            workspaceId: state.workspaceId,
            targetId: state.targetId,
            expectedHostId: state.expectedHostId,
            dialogOpen: false,
            canReconnect: state.canConnect,
            connected: state.connected,
            selected: state.selected,
            busy: false
          }
        },
        ...(!applied ? { reason: 'ssh_host_action_not_applied' } : {})
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16))
  }
  throw new Error(
    workspaceOverlays.has(controller) ? 'request_expired' : 'connections_surface_unavailable'
  )
}
