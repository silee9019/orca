import type { WorktreeMeta } from '../shared/worktree/meta-types'
import { parseExecutionHostId } from '../shared/execution-host'
import { displayNameUpdatePinsLabel } from '../shared/worktree/display-name-provenance'
import { getRepoIdFromWorktreeId } from '../shared/worktree/id'
import { stripOrcaProvenanceMetaUpdates } from './worktree-removal-safety'
import { normalizeLinkedWorkItemFields } from './ipc/worktrees/ipc-context-schemas'
import type { Store } from './persistence'

export type DesktopWorktreeMetadataArgs = {
  worktreeId: string
  executionHostId?: string
  updates: Partial<WorktreeMeta>
}

export function updateDesktopWorktreeMetadata(
  store: Store,
  notifyRemote: (repoId: string) => void,
  args: DesktopWorktreeMetadataArgs
): WorktreeMeta {
  const executionHostId =
    args.executionHostId === undefined ? undefined : parseExecutionHostId(args.executionHostId)?.id
  if (args.executionHostId !== undefined && !executionHostId) {
    throw new Error('Invalid execution host identity.')
  }
  const validatedUpdates = normalizeLinkedWorkItemFields(args.updates)
  const updates =
    validatedUpdates.displayName !== undefined
      ? {
          ...validatedUpdates,
          displayNameIsPinned: displayNameUpdatePinsLabel(validatedUpdates.displayName),
          pendingFirstAgentMessageRename: false,
          firstAgentMessageRenameError: null
        }
      : validatedUpdates
  const sanitizedUpdates = stripOrcaProvenanceMetaUpdates(updates)
  const meta = executionHostId
    ? store.setWorktreeMetaForHost(args.worktreeId, executionHostId, sanitizedUpdates)
    : store.setWorktreeMeta(args.worktreeId, sanitizedUpdates)
  // Desktop renames are optimistic; only remote clients need the title invalidation.
  if (args.updates.displayName !== undefined) {
    notifyRemote(getRepoIdFromWorktreeId(args.worktreeId))
  }
  return meta
}
