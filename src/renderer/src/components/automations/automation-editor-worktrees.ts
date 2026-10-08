import {
  getRepoExecutionHostId,
  getWorktreeExecutionHostId,
  parseExecutionHostId
} from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'

export function getAutomationEditorWorktrees(
  project: Repo | undefined,
  candidates: readonly Worktree[]
): Worktree[] {
  if (!project) {
    return []
  }
  const hostId = getRepoExecutionHostId(project)
  const host = parseExecutionHostId(hostId)
  return candidates.filter(
    (worktree) =>
      getWorktreeExecutionHostId(worktree, project) === hostId ||
      (host?.kind === 'runtime' && worktree.runtimeOwnerEnvironmentId === host.environmentId)
  )
}
