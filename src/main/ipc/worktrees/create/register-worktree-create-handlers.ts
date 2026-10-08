import { ipcMain } from 'electron'
import type {
  CreateWorktreeArgs,
  AdoptProvisionedRootArgs
} from '../../../../shared/worktree/create-types'
import type { WorktreeIpcContext } from '../worktree-ipc-context'
import { createDesktopWorktree } from '../../../worktree-desktop-create-service'
import { registerDesktopWorktreeCreateForRpc } from '../../../worktree-desktop-create-handlers'
import { adoptDesktopProvisionedRoot } from '../../../worktree-desktop-adoption-service'
import { registerDesktopProvisionedRootAdoptionForRpc } from '../../../worktree-desktop-adoption-handlers'
export function registerWorktreeCreateHandlers(context: WorktreeIpcContext): void {
  registerDesktopWorktreeCreateForRpc(context)
  registerDesktopProvisionedRootAdoptionForRpc(context)
  ipcMain.handle('worktrees:create', (_event, args: CreateWorktreeArgs) =>
    createDesktopWorktree(context, args)
  )
  ipcMain.handle('worktrees:adoptProvisionedRoot', (_event, args: AdoptProvisionedRootArgs) =>
    adoptDesktopProvisionedRoot(context, args)
  )
}
