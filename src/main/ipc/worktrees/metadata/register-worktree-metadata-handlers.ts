import { registerDesktopWorktreeLineageHandlers } from '../../../worktree-desktop-lineage-handlers'
import { ipcMain } from 'electron'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import type {
  ListDesktopLineageForHostArgs,
  HostLineageSnapshot
} from '../../../../shared/host-lineage-contract'
import { planWorktreeSortOrderUpdates } from '../../../../shared/worktree/sort-order-update'
import { readBranchRenameFailureOutputForDisplay } from '../../../agent-hooks/branch-rename-failure-output'
import { listDesktopLineageForHost } from './host-lineage-listing'
import {
  updateDesktopWorktreeMetadata,
  type DesktopWorktreeMetadataArgs
} from '../../../desktop-worktree-metadata'
import { setDesktopWorktreeMetadataForRpc } from '../../../runtime/rpc/methods/workspace-desktop-meta'
import { getRepoForExecutionHost } from '../../../repo-execution-host-selection'
import type { WorktreeIpcContext } from '../worktree-ipc-context'

export function registerWorktreeMetadataHandlers(
  context: Pick<WorktreeIpcContext, 'store' | 'runtime' | 'mainWindow'>
): void {
  const { store, runtime } = context
  const updateMetadata = (args: DesktopWorktreeMetadataArgs) =>
    updateDesktopWorktreeMetadata(
      store,
      (repoId) => runtime.notifyWorktreesChangedForRemoteClients(repoId),
      args
    )
  ipcMain.handle('worktrees:updateMeta', (_event, args: DesktopWorktreeMetadataArgs) =>
    updateMetadata(args)
  )
  setDesktopWorktreeMetadataForRpc(async (args) => {
    if (
      !getRepoForExecutionHost(
        store,
        getRepoIdFromWorktreeId(args.worktreeId),
        args.executionHostId
      )
    ) {
      throw new Error('selector_not_found')
    }
    try {
      updateMetadata(args)
      await store.flushPendingOrThrowAsync()
    } catch {
      throw new Error('Desktop workspace metadata update failed.')
    }
  })

  ipcMain.handle('worktrees:listLineage', async () => {
    await runtime.hydrateInferredWorktreeLineage()
    return {
      lineage: store.getAllWorktreeLineage(),
      workspaceLineage: store.getAllWorkspaceLineage()
    }
  })

  ipcMain.handle(
    'worktrees:listLineageForHost',
    (_event, args: ListDesktopLineageForHostArgs): Promise<HostLineageSnapshot> =>
      listDesktopLineageForHost(store, runtime, args)
  )

  registerDesktopWorktreeLineageHandlers(context)

  ipcMain.handle('worktrees:persistSortOrder', (_event, args: { orderedIds: string[] }) => {
    if (!Array.isArray(args?.orderedIds) || args.orderedIds.length === 0) {
      return
    }
    const updates = planWorktreeSortOrderUpdates(
      args.orderedIds,
      (worktreeId) => store.getWorktreeMeta(worktreeId),
      Date.now()
    )
    for (const update of updates) {
      store.setWorktreeMeta(update.worktreeId, { sortOrder: update.sortOrder })
    }
  })

  ipcMain.handle(
    'worktrees:getBranchRenameFailureOutput',
    (_event, args: { worktreeId: string }) => {
      if (typeof args?.worktreeId !== 'string' || args.worktreeId.length === 0) {
        return null
      }
      return readBranchRenameFailureOutputForDisplay(args.worktreeId)
    }
  )
}
