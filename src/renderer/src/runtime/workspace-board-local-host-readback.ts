import { useAppStore } from '@/store'
import { acquireDetectedWorktreeRefreshLeaseForRepo } from '@/store/slices/worktrees/listing/detected-worktree-refresh'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { withTimeout } from '../../../shared/promise-timeout-fallback'
import { getWorkspaceStatus } from '../../../shared/workspace-statuses'
import type { DetectedWorktree, WorkspaceStatusDefinition } from '../../../shared/worktree/types'

export type LocalHostWrite = 'confirmed' | 'unverifiable' | 'not_confirmed'

const POLL_INTERVAL_MS = 100
const OBSERVE_INTERVAL_MS = 25

// Why: only an authoritative local scan names this host's own rows, so a repo id shared with another host
// is never answered from that host.
async function listLocalWorktrees(
  repoId: string,
  timeoutMs: number
): Promise<readonly DetectedWorktree[] | null> {
  try {
    const lease = acquireDetectedWorktreeRefreshLeaseForRepo(
      useAppStore.getState().settings,
      repoId,
      { executionHostId: LOCAL_EXECUTION_HOST_ID, requireAuthoritative: true }
    )
    const answer = await withTimeout(lease.result, timeoutMs, null)
    if (!answer) {
      lease.release('stopped')
      return null
    }
    return answer.status === 'complete' ? answer.result.worktrees : null
  } catch {
    return null
  }
}

// Why: the store's batch update swallows a failed host write, so only a read of the local host's own
// catalog can say the status landed. Remote hosts are never read here and stay unverifiable.
export async function readBackLocalWorkspaceStatuses(args: {
  targets: readonly { id: string; repoId: string }[]
  statusId: string
  statuses: readonly WorkspaceStatusDefinition[]
  keepWaiting: () => boolean
  deadline: number
}): Promise<Map<string, LocalHostWrite>> {
  const outcome = new Map<string, LocalHostWrite>(
    args.targets.map((target) => [target.id, 'unverifiable'])
  )
  let pending = args.targets
  while (pending.length > 0 && Date.now() < args.deadline && args.keepWaiting()) {
    for (const repoId of new Set(pending.map((target) => target.repoId))) {
      const listed = await listLocalWorktrees(repoId, Math.max(0, args.deadline - Date.now()))
      if (!listed) {
        continue
      }
      for (const target of pending.filter((candidate) => candidate.repoId === repoId)) {
        const found = listed.find((worktree) => worktree.id === target.id)
        outcome.set(
          target.id,
          !found
            ? 'unverifiable'
            : getWorkspaceStatus(found, args.statuses) === args.statusId
              ? 'confirmed'
              : 'not_confirmed'
        )
      }
    }
    pending = pending.filter((target) => outcome.get(target.id) !== 'confirmed')
    // Why: the board is watched between reads so a short-lived render of the move is still seen.
    const nextRead = Date.now() + POLL_INTERVAL_MS
    while (pending.length > 0 && Date.now() < nextRead && args.keepWaiting()) {
      await new Promise<void>((resolve) => setTimeout(resolve, OBSERVE_INTERVAL_MS))
    }
  }
  return outcome
}
