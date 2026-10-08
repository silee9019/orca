import { ipcMain } from 'electron'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { parseWorktreeId } from '../../worktree-logic'
import type { RemoveWorktreeArgs } from '../ipc-context-schemas'
import type { WorktreeIpcContext } from '../worktree-ipc-context'
import { previewNestedWorktreeRemoval } from './nested-worktree-removal'
import { resolveRepoForExecutionHost } from '../repo-host-ownership'
import { createDesktopWorktreeRemoval } from '../../../worktree-desktop-removal-service'
import { registerDesktopWorktreeRemovalForRpc } from '../../../worktree-desktop-removal-handlers'

export function registerWorktreeRemovalHandlers(context: WorktreeIpcContext): void {
  const { store } = context
  const remove = createDesktopWorktreeRemoval(context)
  registerDesktopWorktreeRemovalForRpc(context, remove)
  ipcMain.handle('worktrees:previewNestedRemoval', async (_event, args: RemoveWorktreeArgs) => {
    const { repoId, worktreePath } = parseWorktreeId(args.worktreeId)
    const repo = resolveRepoForExecutionHost(store, repoId, args.hostId)
    if (!repo) {
      throw new Error(`Repo not found: ${repoId}`)
    }
    return previewNestedWorktreeRemoval(context, repo, worktreePath, getRepoExecutionHostId(repo))
  })

  ipcMain.handle('worktrees:remove', (_event, args: RemoveWorktreeArgs) => remove(args))
}
