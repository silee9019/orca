import { ipcMain } from 'electron'
import type { Store } from './persistence'
import type { Repo } from '../shared/repo-types'
import type {
  GitHubPRRefreshCandidate,
  GitHubPRRefreshReason,
  GitHubPRRefreshEnqueueResult,
  PRRefreshOutcome
} from '../shared/github/pull-request-refresh-types'
import { refreshPRNow, enqueuePRRefresh } from './github/pr-refresh-coordinator'
import {
  assertRegisteredGitHubRepo,
  applyRegisteredRepoToPRRefreshCandidate,
  validateAutomaticPRRefreshCandidate
} from './ipc/github-repo-routing'
import { setDesktopGitHubRefreshForRpc } from './runtime/rpc/methods/workspace-github-refresh'
type RefreshArgs = { candidate: GitHubPRRefreshCandidate; reason?: GitHubPRRefreshReason }
type EnqueueArgs = {
  candidate: GitHubPRRefreshCandidate
  reason: GitHubPRRefreshReason
  priority?: number
}
export type DesktopGitHubRefreshServices = {
  getRepo: (id: string) => Repo | undefined
  refresh: (args: RefreshArgs) => Promise<PRRefreshOutcome>
  enqueue: (args: EnqueueArgs, windowId?: number) => GitHubPRRefreshEnqueueResult
}
export function registerDesktopGitHubRefreshHandlers(
  store: Store,
  record: (repo: Repo, outcome: PRRefreshOutcome) => void
): void {
  const refresh = async (args: RefreshArgs) => {
    const repo = assertRegisteredGitHubRepo(args.candidate, store)
    const outcome = await refreshPRNow(
      applyRegisteredRepoToPRRefreshCandidate(store, repo, args.candidate),
      args.reason
    )
    record(repo, outcome)
    return outcome
  }
  const enqueue = (args: EnqueueArgs, windowId?: number): GitHubPRRefreshEnqueueResult => {
    const validation = validateAutomaticPRRefreshCandidate(args.candidate, store)
    if (validation.kind === 'skipped') {
      return validation.result
    }
    enqueuePRRefresh(validation.candidate, args.reason, args.priority ?? 0, windowId)
    return { kind: 'queued' }
  }
  ipcMain.handle('gh:refreshPRNow', (_event, args: RefreshArgs) => refresh(args))
  ipcMain.handle('gh:enqueuePRRefresh', (event, args: EnqueueArgs) =>
    enqueue(args, event?.sender?.id)
  )
  setDesktopGitHubRefreshForRpc({
    getRepo: (id) => store.getRepos().find((repo) => repo.id === id),
    refresh,
    enqueue
  })
}
