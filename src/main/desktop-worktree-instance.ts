import type { z } from 'zod'
import type { DesktopWorktreeInstanceTarget } from '../shared/rpc-contract/workspace-lineage-params'
import { getRepoIdFromWorktreeId } from '../shared/worktree/id'
import { getRepoExecutionHostId } from '../shared/execution-host'
import { getRepoForExecutionHost } from './repo-execution-host-selection'
import type { WorktreeIpcContext } from './ipc/worktrees/worktree-ipc-context'
type Target = z.infer<typeof DesktopWorktreeInstanceTarget>
export async function resolveDesktopWorktreeInstance(
  { store, runtime }: Pick<WorktreeIpcContext, 'store' | 'runtime'>,
  target: Target
) {
  const repoId = getRepoIdFromWorktreeId(target.worktreeId)
  const owner = getRepoForExecutionHost(store, repoId, target.executionHostId)
  if (
    target.executionHostId.startsWith('runtime:') ||
    store.getRepos().filter((repo) => repo.id === repoId).length !== 1 ||
    !owner
  ) {
    throw new Error('Desktop workspace owner is unavailable or ambiguous.')
  }
  if ('instanceId' in target && owner.kind !== 'folder') {
    throw new Error('Instance-only workspace selection requires a folder repository.')
  }
  const worktree = await runtime.showManagedWorktree(
    'identityKey' in target ? `identity:${target.identityKey}` : `id:${target.worktreeId}`
  )
  if (
    'instanceId' in target &&
    store.getWorktreeMetaForHost(target.worktreeId, target.executionHostId)?.instanceId !==
      target.instanceId
  ) {
    throw new Error('Persisted folder instance changed.')
  }
  const hostId =
    worktree.identity?.executionHostId ?? worktree.hostId ?? getRepoExecutionHostId(owner)
  if (
    worktree.id !== target.worktreeId ||
    worktree.repoId !== owner.id ||
    ('identityKey' in target
      ? worktree.identity?.key !== target.identityKey
      : worktree.instanceId !== target.instanceId) ||
    hostId !== target.executionHostId ||
    !worktree.instanceId
  ) {
    throw new Error('Desktop workspace instance changed.')
  }
  return worktree
}
