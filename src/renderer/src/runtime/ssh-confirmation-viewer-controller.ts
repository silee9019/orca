import { applySshWorkspaceRemovalViewerRequest } from './ssh-workspace-viewer-controller'
export {
  mountSshWorkspaceRemovalViewerController,
  mountSshWorkspaceOverlayViewerController
} from './ssh-workspace-viewer-controller'
export type {
  SshWorkspaceRemovalViewerController,
  SshWorkspaceOverlayViewerController
} from './ssh-workspace-viewer-controller'
import type { ConnectionsViewerRequest } from '../../../shared/connections-viewer'
import type {
  SshHostRemovalViewerState,
  SshConfirmationViewerState,
  SshConfirmationViewerResult
} from '../../../shared/ssh-confirmation-viewer'
import type { SshTerminateSessionsResult } from '../../../shared/ssh-types'
import { SshConfirmationConnectionsViewerParams } from '../../../shared/rpc-contract/ssh-confirmation-viewer-params'
type Kind = 'reset' | 'terminate' | 'remove'
export type SshConfirmationViewerController = {
  read: () => SshConfirmationViewerState
  request: (kind: Kind, targetId: string) => boolean
  confirm: (kind: Kind) => Promise<boolean | SshTerminateSessionsResult | void>
  cancel: (kind: Kind) => void
}
function pendingTarget(state: SshConfirmationViewerState, kind: Kind): string | null {
  return kind === 'remove'
    ? (state.removeTargetId ?? null)
    : kind === 'reset'
      ? state.resetTargetId
      : state.terminateTargetId
}
export type SshHostRemovalViewerController = {
  targetId: string
  read: () => SshHostRemovalViewerState
  configure: (advancedOpen: boolean, deleteWorkspaces: boolean) => void
  confirm: (disposition: 'keep' | 'delete-remote' | 'forget-local') => Promise<boolean>
  cancel: () => void
}
const hostRemovals = new Set<SshHostRemovalViewerController>()
export function mountSshHostRemovalViewerController(
  controller: SshHostRemovalViewerController
): () => void {
  hostRemovals.add(controller)
  return () => {
    hostRemovals.delete(controller)
  }
}
function hostRemoval(targetId: string): SshHostRemovalViewerController | null {
  const matches = [...hostRemovals].filter((entry) => entry.targetId === targetId)
  if (matches.length > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  return matches[0] ?? null
}
export function readSshHostRemovalViewerState(
  targetId: string | null | undefined
): SshHostRemovalViewerState | null {
  return targetId ? (hostRemoval(targetId)?.read() ?? null) : null
}
const mounted = new Set<SshConfirmationViewerController>()
export function mountSshConfirmationViewerController(
  controller: SshConfirmationViewerController
): () => void {
  mounted.add(controller)
  return () => {
    mounted.delete(controller)
  }
}
export async function applySshConfirmationViewerRequest(
  request: ConnectionsViewerRequest
): Promise<SshConfirmationViewerResult> {
  if (request.command.operation.startsWith('ssh-workspace.')) {
    return applySshWorkspaceRemovalViewerRequest(request)
  }
  const command = SshConfirmationConnectionsViewerParams.parse(request.command)
  if (mounted.size > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const controller = mounted.values().next().value
  if (!controller) {
    throw new Error('connections_surface_unavailable')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const initial = controller.read()
  if (
    command.operation !== 'ssh-confirmation.get' &&
    (initial.busy || initial.workspaceDetails?.busy)
  ) {
    throw new Error('ssh_action_in_progress')
  }
  let completed = true
  let termination: SshTerminateSessionsResult | null = null
  switch (command.operation) {
    case 'ssh-confirmation.get':
      break
    case 'ssh-confirmation.request':
      if (
        ['reset', 'terminate', 'remove'].some(
          (kind) =>
            kind !== command.kind &&
            (kind === 'reset'
              ? initial.resetTargetId
              : kind === 'terminate'
                ? initial.terminateTargetId
                : initial.removeTargetId) != null
        )
      ) {
        throw new Error('ssh_confirmation_in_progress')
      }
      if (!controller.request(command.kind, command.targetId)) {
        throw new Error('ssh_target_unavailable')
      }
      break
    case 'ssh-confirmation.cancel':
      if (command.kind === 'remove' && initial.workspaceRemoval) {
        const host = initial.removeTargetId ? hostRemoval(initial.removeTargetId) : null
        if (!host) {
          throw new Error('ssh_workspace_removal_confirmation_required')
        }
        host.cancel()
      } else {
        controller.cancel(command.kind)
      }
      break
    case 'ssh-confirmation.remove-options': {
      const target = initial.removeTargetId
      if (!initial.workspaceRemoval || target !== command.confirmTarget) {
        throw new Error('confirm_target_mismatch')
      }
      const host = hostRemoval(command.confirmTarget)
      if (!host) {
        throw new Error('ssh_workspace_removal_confirmation_required')
      }
      if (command.deleteWorkspaces && !command.advancedOpen) {
        throw new Error('workspace_removal_opt_in_required')
      }
      host.configure(command.advancedOpen, command.deleteWorkspaces)
      break
    }
    case 'ssh-confirmation.confirm': {
      const target = pendingTarget(initial, command.kind)
      if (!target || target !== command.confirmTarget) {
        throw new Error('confirm_target_mismatch')
      }
      let outcome: boolean | SshTerminateSessionsResult | void
      if (command.kind === 'remove' && initial.workspaceRemoval) {
        const host = hostRemoval(target)
        if (!host || !command.workspaceDisposition) {
          throw new Error('ssh_workspace_removal_confirmation_required')
        }
        const current = host.read()
        const disposition = current.deleteWorkspaces
          ? current.isConnected
            ? 'delete-remote'
            : 'forget-local'
          : 'keep'
        if (command.workspaceDisposition !== disposition) {
          throw new Error('workspace_disposition_mismatch')
        }
        outcome = await host.confirm(command.workspaceDisposition)
      } else {
        outcome = await controller.confirm(command.kind)
      }
      completed = outcome !== false
      if (outcome && typeof outcome === 'object') {
        termination = outcome
      }
      break
    }
  }
  while (mounted.has(controller) && mounted.size === 1 && Date.now() < request.expiresAt) {
    const state = controller.read()
    const target =
      command.operation === 'ssh-confirmation.get'
        ? null
        : pendingTarget(
            state,
            command.operation === 'ssh-confirmation.remove-options' ? 'remove' : command.kind
          )
    const applied =
      command.operation === 'ssh-confirmation.get' ||
      (command.operation === 'ssh-confirmation.request'
        ? target === command.targetId
        : command.operation === 'ssh-confirmation.remove-options'
          ? target === command.confirmTarget &&
            state.workspaceDetails?.advancedOpen === command.advancedOpen &&
            state.workspaceDetails?.deleteWorkspaces === command.deleteWorkspaces
          : (target === null || !completed) && !state.busy && !state.workspaceDetails?.busy)
    if (applied) {
      return {
        viewerId: command.viewerId,
        state,
        applied: completed,
        persisted: null,
        termination,
        ...(!completed ? { reason: 'ssh_action_failed' } : {})
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('viewer_not_applied')
}
