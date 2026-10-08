import { buildCliWorkspaceProvenance } from '../shared/cli-workspace-provenance'
import { isRuntimeOwnedSshTargetId, parseExecutionHostId } from '../shared/execution-host'
import { isFolderRepo } from '../shared/repo-kind'
import type { CreateWorktreeResult } from '../shared/worktree/create-types'
import { getRepoForExecutionHost } from './repo-execution-host-selection'
import type { DesktopWorktreeCreateContext } from './worktree-desktop-create-service'
import { adoptDesktopProvisionedRoot } from './worktree-desktop-adoption-service'
import { setDesktopProvisionedRootAdoptionForRpc } from './runtime/rpc/methods/workspace-desktop-adopt'
export type DesktopProvisionedRootAdoptionReceipt = {
  adopted: true
  runtimeId: string
  executionHostId: 'local'
  repoHostId: string
  worktree: { id: string; repoId: string; path: string; branch: string; instanceId?: string }
  catalogVersion?: CreateWorktreeResult['catalogVersion']
}
export function registerDesktopProvisionedRootAdoptionForRpc(
  context: DesktopWorktreeCreateContext
): void {
  setDesktopProvisionedRootAdoptionForRpc(async (params) => {
    try {
      const { expectedExecutionHostId, expectedRepoHostId, ...args } = params
      const host = parseExecutionHostId(expectedRepoHostId)
      const repo = getRepoForExecutionHost(context.store, args.repoId, expectedRepoHostId)
      if (
        expectedExecutionHostId !== 'local' ||
        host?.kind !== 'ssh' ||
        !isRuntimeOwnedSshTargetId(host.targetId) ||
        !repo ||
        isFolderRepo(repo) ||
        context.store.getRepos().filter((item) => item.id === args.repoId).length !== 1
      ) {
        throw new Error('Repository runtime owner is unavailable or ambiguous.')
      }
      const result = await adoptDesktopProvisionedRoot(
        context,
        { ...args, executionHostId: expectedRepoHostId },
        buildCliWorkspaceProvenance(
          {},
          { createdAt: Date.now(), startupAgent: args.createdWithAgent }
        )
      )
      await context.store.flushPendingOrThrowAsync()
      return {
        adopted: true,
        runtimeId: args.runtimeId,
        executionHostId: 'local',
        repoHostId: expectedRepoHostId,
        worktree: {
          id: result.worktree.id,
          repoId: result.worktree.repoId,
          path: result.worktree.path,
          branch: result.worktree.branch,
          instanceId: result.worktree.instanceId
        },
        catalogVersion: result.catalogVersion
      }
    } catch {
      throw new Error('Desktop provisioned-root adoption failed.')
    }
  })
}
