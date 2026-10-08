import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { searchRuntimeRepoBaseRefs } from '@/runtime/runtime-repo-client'
import { isRuntimeRepoRefSearchQueryWithinLimit } from '@/runtime/runtime-repo-search-bounds'
export async function isAutomationBaseBranchChoice(
  value: string,
  repo: Repo | undefined,
  worktrees: readonly Worktree[],
  environmentId: string | null
): Promise<boolean> {
  if (!repo || !isRuntimeRepoRefSearchQueryWithinLimit(value)) {
    return false
  }
  if (
    !value ||
    value === repo.worktreeBaseRef ||
    worktrees.some((entry) => entry.branch.replace(/^refs\/heads\//, '').trim() === value)
  ) {
    return true
  }
  const refs = await searchRuntimeRepoBaseRefs(
    { activeRuntimeEnvironmentId: environmentId },
    repo.id,
    value,
    30,
    getRepoExecutionHostId(repo)
  )
  return refs.includes(value)
}
