import type { Store } from './persistence'
import { assertRegisteredGitHubRepo } from './ipc/github-repo-routing'
import { broadcastGitHubWorkItemMutation } from './ipc/github-work-item-mutation-events'

export function notifyGitHubWorkItemMutation(
  store: Store,
  args: { repoPath: string; repoId?: string; type: string; number: number },
  senderId?: number
): boolean {
  const repo = args.repoId
    ? store.getRepos().find((candidate) => candidate.id === args.repoId)
    : assertRegisteredGitHubRepo(args, store)
  if (!repo) {
    return false
  }
  if (
    (args.type !== 'issue' && args.type !== 'pr') ||
    !Number.isInteger(args.number) ||
    args.number < 1
  ) {
    return false
  }
  broadcastGitHubWorkItemMutation(
    { repoPath: repo.path, repoId: repo.id, type: args.type, number: args.number },
    senderId
  )
  return true
}
