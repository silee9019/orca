import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { getRepoExecutionHostId, getWorktreeExecutionHostId } from '../../shared/execution-host'
import { isFolderRepo } from '../../shared/repo-kind'
import type { LocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import type { SetupRunnerShell } from '../../shared/setup-runner-command'
import { createIssueCommandRunnerScript } from '../worktree-runner-script'

type IssueCommandRunnerDependencies = {
  resolveWorktree: (
    selector: string
  ) => Promise<Pick<Worktree, 'id' | 'repoId' | 'path' | 'hostId'>>
  getRepo: (repoId: string) => Repo | undefined
  getRuntimeOptions: (repo: Repo) => LocalProjectWorktreeGitOptions
  getSetupShell: () => SetupRunnerShell | undefined
}

export async function createWorkspaceIssueCommandRunner(
  dependencies: IssueCommandRunnerDependencies,
  selector: string,
  command: string
) {
  const worktree = await dependencies.resolveWorktree(selector)
  const repo = dependencies.getRepo(worktree.repoId)
  if (!repo) {
    throw new Error('issue_runner_repo_not_found')
  }
  if (isFolderRepo(repo) || worktree.id.startsWith('folder:')) {
    throw new Error('issue_runner_git_workspace_required')
  }
  if (
    getRepoExecutionHostId(repo) !== 'local' ||
    getWorktreeExecutionHostId(worktree, repo) !== 'local'
  ) {
    throw new Error('issue_runner_execution_host_unsupported')
  }
  return createIssueCommandRunnerScript(
    repo,
    worktree.path,
    command,
    dependencies.getRuntimeOptions(repo),
    dependencies.getSetupShell()
  )
}
