import { defineMethod } from '../core'
import type { Store } from '../../../persistence'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { notifyGitHubWorkItemMutation } from '../../../github-work-item-notification'
import { DesktopWorkItemNotify } from '../../../../shared/rpc-contract/workspace-work-item-notify-params'
let store: Store | null = null
export function setDesktopWorkItemNotificationStore(value: Store | null): void {
  store = value
}
export const WORKSPACE_WORK_ITEM_NOTIFY_METHODS = [
  defineMethod({
    name: 'github.notifyDesktopWorkItemMutated',
    params: DesktopWorkItemNotify,
    handler: (params) => {
      if (!store) {
        throw new Error('runtime_unavailable')
      }
      const repo = store.getRepos().find((candidate) => candidate.id === params.repoId)
      if (
        !repo ||
        repo.kind === 'folder' ||
        getRepoExecutionHostId(repo) !== params.expectedRepoHostId
      ) {
        throw new Error('Registered work item repository or host mismatch.')
      }
      try {
        const requested = notifyGitHubWorkItemMutation(store, {
          repoPath: repo.path,
          repoId: repo.id,
          type: params.type,
          number: params.number
        })
        return { requested, rendered: false }
      } catch {
        throw new Error('Work item notification failed.')
      }
    }
  })
]
