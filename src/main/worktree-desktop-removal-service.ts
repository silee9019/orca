import { getLocalWorktreeCatalogVersion } from './local-worktree-scan-generation'
import type { RemoveWorktreeResult } from '../shared/worktree/create-types'
import { getRepoExecutionHostId } from '../shared/execution-host'
import { withWorktreeSpan } from './observability/instrumentation'
import { areWorktreePathsEqual, parseWorktreeId } from './ipc/worktree-logic'
import type { RemoveWorktreeArgs } from './ipc/worktrees/ipc-context-schemas'
import type { WorktreeIpcContext } from './ipc/worktrees/worktree-ipc-context'
import { executeWorktreeRemoval } from './ipc/worktrees/removal/execute-worktree-removal'
import { removeApprovedNestedWorktrees } from './ipc/worktrees/removal/nested-worktree-removal'
import {
  getWorktreeRemovalInFlightKey,
  getWorktreeRemovalOptionsKey
} from './ipc/worktrees/removal/worktree-removal-coordinator'
import { resolveRepoForExecutionHost } from './ipc/worktrees/repo-host-ownership'
import {
  finishAcceptedWorktreeRemoval,
  waitForPendingWorktreeRemoval
} from './worktree-background-removal'
import { runSerializedWorktreeRemovalAcceptance } from './worktree-removal-acceptance-queue'

export function createDesktopWorktreeRemoval(context: WorktreeIpcContext) {
  const { store, options, worktreeRemovalsInFlight } = context
  const remove = async (args: RemoveWorktreeArgs): Promise<RemoveWorktreeResult> => {
    const { repoId, worktreePath } = parseWorktreeId(args.worktreeId)
    const repo = resolveRepoForExecutionHost(store, repoId, args.hostId)
    if (!repo) {
      throw new Error(`Repo not found: ${repoId}`)
    }
    const removalHostId = getRepoExecutionHostId(repo)
    const pending = waitForPendingWorktreeRemoval(args.worktreeId, removalHostId)
    if (pending) {
      return { ...(await pending), catalogVersion: getLocalWorktreeCatalogVersion(repoId) }
    }
    const inFlightKey = getWorktreeRemovalInFlightKey(args.worktreeId, removalHostId)
    const optionsKey = getWorktreeRemovalOptionsKey(args)
    const inFlightRemoval = worktreeRemovalsInFlight.get(inFlightKey)
    if (inFlightRemoval) {
      if (inFlightRemoval.optionsKey === optionsKey) {
        return inFlightRemoval.promise
      }
      throw new Error(`Worktree deletion already in progress: ${args.worktreeId}`)
    }

    const removal = withWorktreeSpan({ stage: 'remove', path: worktreePath }, async () => {
      const nestedPreservedBranches = args.approvedNestedWorktrees
        ? await removeApprovedNestedWorktrees({
            context,
            repo,
            worktreePath,
            hostId: removalHostId,
            removalArgs: args,
            remove
          })
        : []
      const expectedCheckout = args.approvedNestedWorktrees?.find((item) =>
        areWorktreePathsEqual(item.path, worktreePath)
      )
      const executionArgs = expectedCheckout ? { ...args, expectedCheckout } : args
      const accept = async (): Promise<RemoveWorktreeResult> =>
        waitForPendingWorktreeRemoval(args.worktreeId, removalHostId)
          ? { removing: true }
          : executeWorktreeRemoval(
              context,
              executionArgs,
              repo,
              repoId,
              worktreePath,
              removalHostId
            )
      let accepted: RemoveWorktreeResult
      let result: RemoveWorktreeResult
      try {
        accepted = await (repo.connectionId
          ? accept()
          : runSerializedWorktreeRemovalAcceptance(repo.path, accept))
        result = await finishAcceptedWorktreeRemoval(accepted, args.worktreeId, removalHostId)
      } catch (error) {
        if (nestedPreservedBranches.length > 0) {
          throw new Error(
            `${error instanceof Error ? error.message : String(error)} Branches kept after nested deletions: ${nestedPreservedBranches.map((item) => item.branchName).join(', ')}.`,
            { cause: error }
          )
        }
        throw error
      }
      if (!accepted.removing) {
        options?.onWorktreeLifecycle?.({
          kind: 'removed',
          worktreeId: args.worktreeId,
          path: worktreePath
        })
      }
      return {
        ...result,
        ...(nestedPreservedBranches.length > 0 ? { nestedPreservedBranches } : {}),
        catalogVersion: getLocalWorktreeCatalogVersion(repoId)
      }
    })
    worktreeRemovalsInFlight.set(inFlightKey, { optionsKey, promise: removal })
    try {
      return await removal
    } finally {
      if (worktreeRemovalsInFlight.get(inFlightKey)?.promise === removal) {
        worktreeRemovalsInFlight.delete(inFlightKey)
      }
    }
  }
  return remove
}
