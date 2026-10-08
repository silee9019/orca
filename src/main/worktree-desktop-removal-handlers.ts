import type { z } from 'zod'
import type {
  DesktopWorktreeRemove,
  DesktopWorktreeRemovalPreview
} from '../shared/rpc-contract/workspace-desktop-remove-params'
import type { WorktreeIpcContext } from './ipc/worktrees/worktree-ipc-context'
import type { RemoveWorktreeArgs } from './ipc/worktrees/ipc-context-schemas'
import type { RemoveWorktreeResult } from '../shared/worktree/create-types'
import type { NestedWorktreeRemovalApproval } from '../shared/worktree/nested-removal'
import { resolveDesktopWorktreeInstance } from './desktop-worktree-instance'
import { getRepoForExecutionHost } from './repo-execution-host-selection'
import { isFolderRepo } from '../shared/repo-kind'
import { previewNestedWorktreeRemoval } from './ipc/worktrees/removal/nested-worktree-removal'
import { setDesktopWorktreeRemovalForRpc } from './runtime/rpc/methods/workspace-desktop-remove'
type PreviewParams = z.infer<typeof DesktopWorktreeRemovalPreview>
type RemoveParams = z.infer<typeof DesktopWorktreeRemove>
type Receipt = {
  removed: true
  worktreeId: string
  executionHostId: string
  scope: 'metadata' | 'checkout-and-metadata'
  executionVerdict: 'unverifiable'
  catalogVersion?: RemoveWorktreeResult['catalogVersion']
  preservedBranch?: RemoveWorktreeResult['preservedBranch']
  nestedPreservedBranches?: RemoveWorktreeResult['nestedPreservedBranches']
  archiveHookFailureWaived: boolean
}
export type DesktopWorktreeRemovalServices = {
  preview: (params: PreviewParams) => Promise<{ checkouts: NestedWorktreeRemovalApproval[] }>
  remove: (params: RemoveParams) => Promise<Receipt>
}
export function registerDesktopWorktreeRemovalForRpc(
  context: WorktreeIpcContext,
  remove: (args: RemoveWorktreeArgs) => Promise<RemoveWorktreeResult>
): void {
  const resolve = async (params: PreviewParams) => {
    const worktree = await resolveDesktopWorktreeInstance(context, params.target)
    const repo = getRepoForExecutionHost(
      context.store,
      worktree.repoId,
      params.target.executionHostId
    )
    if (!repo) {
      throw new Error('Missing workspace owner.')
    }
    return { worktree, repo }
  }
  setDesktopWorktreeRemovalForRpc({
    preview: async (params) => {
      try {
        const { worktree, repo } = await resolve(params)
        const checkouts = await previewNestedWorktreeRemoval(
          context,
          repo,
          worktree.path,
          params.target.executionHostId
        )
        return { checkouts: checkouts.map(({ path, head, branch }) => ({ path, head, branch })) }
      } catch {
        throw new Error('Desktop workspace removal preview failed.')
      }
    },
    remove: async (params) => {
      try {
        const { target, ...args } = params
        const { worktree, repo } = await resolve(params)
        if (!isFolderRepo(repo) && !args.expectedCheckout) {
          throw new Error('A fresh checkout preview is required.')
        }
        if (isFolderRepo(repo) && (args.expectedCheckout || args.approvedNestedWorktrees)) {
          throw new Error('Folder deletion cannot approve Git checkouts.')
        }
        const result = await remove({
          ...args,
          worktreeId: worktree.id,
          hostId: target.executionHostId
        })
        if (result.removing) {
          throw new Error('Workspace deletion did not finish.')
        }
        await context.store.flushPendingOrThrowAsync()
        return {
          removed: true,
          worktreeId: worktree.id,
          executionHostId: target.executionHostId,
          scope: isFolderRepo(repo) ? 'metadata' : 'checkout-and-metadata',
          executionVerdict: 'unverifiable',
          catalogVersion: result.catalogVersion,
          preservedBranch: result.preservedBranch,
          nestedPreservedBranches: result.nestedPreservedBranches,
          archiveHookFailureWaived: Boolean(result.archiveHookOverride)
        }
      } catch {
        throw new Error('Desktop workspace removal failed.')
      }
    }
  })
}
