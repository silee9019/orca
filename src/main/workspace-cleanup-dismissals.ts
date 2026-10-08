import {
  WORKSPACE_CLEANUP_CLASSIFIER_VERSION,
  type WorkspaceCleanupDismissArgs,
  type WorkspaceCleanupUIState
} from '../shared/workspace-cleanup'
import { parseExecutionHostId } from '../shared/execution-host'
import { getWorkspaceCleanupHostIdentity } from '../shared/workspace-cleanup-host-identity'

export function mergeWorkspaceCleanupDismissals(
  current: WorkspaceCleanupUIState['dismissals'] | undefined,
  args: WorkspaceCleanupDismissArgs
): WorkspaceCleanupUIState['dismissals'] {
  const next = { ...current }
  for (const worktreeId of args.removedWorktreeIds ?? []) {
    for (const [identity, dismissal] of Object.entries(next)) {
      if (dismissal.worktreeId === worktreeId) {
        delete next[identity]
      }
    }
  }
  for (const dismissal of args.dismissals ?? []) {
    if (
      dismissal &&
      dismissal.classifierVersion === WORKSPACE_CLEANUP_CLASSIFIER_VERSION &&
      typeof dismissal.worktreeId === 'string' &&
      typeof dismissal.fingerprint === 'string' &&
      (dismissal.executionHostId === undefined || parseExecutionHostId(dismissal.executionHostId))
    ) {
      const identity = dismissal.executionHostId
        ? getWorkspaceCleanupHostIdentity(dismissal.executionHostId, dismissal.worktreeId)
        : dismissal.worktreeId
      next[identity] = dismissal
    }
  }
  return next
}
