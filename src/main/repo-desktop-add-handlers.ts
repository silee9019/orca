import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import type { Store } from './persistence'
import type { Repo } from '../shared/repo-types'
import { addLocalRepoFromPath } from './ipc/repos/local-repo-registration'
import { addRemoteRepoFromPath } from './ipc/repos/remote-repo-registration'
import { prepareLocalWorktreeRootForRepo } from './worktree-root-preparation'
import { invalidateAuthorizedRootsCache } from './ipc/registered-worktree-roots-cache'
import { emitRepoAdded } from './ipc/repos/repo-added-telemetry'
import { notifyReposChanged } from './ipc/repos/repos-changed-notification'
import { setDesktopRepoAddForRpc } from './runtime/rpc/methods/workspace-repo-add'
type RepoAddResult = { repo: Repo } | { error: string }
export type DesktopRepoAddServices = {
  addLocal: (args: {
    path: string
    kind?: 'git' | 'folder'
    displayName?: string
  }) => Promise<RepoAddResult>
  addRemote: (args: {
    connectionId: string
    remotePath: string
    kind?: 'git' | 'folder'
    displayName?: string
  }) => Promise<RepoAddResult>
}
export function registerDesktopRepoAddHandlers(mainWindow: BrowserWindow, store: Store): void {
  const addLocal = async (
    args: Parameters<DesktopRepoAddServices['addLocal']>[0],
    fromPicker = false
  ): Promise<RepoAddResult> => {
    const result = await addLocalRepoFromPath(store, args.path, args.kind, args.displayName)
    if ('error' in result) {
      return result
    }
    if (result.alreadyExisted) {
      await prepareLocalWorktreeRootForRepo(store, result.repo)
    }
    invalidateAuthorizedRootsCache()
    notifyReposChanged(mainWindow)
    if (fromPicker) {
      emitRepoAdded('folder_picker', result.alreadyExisted, result.repo.kind === 'git')
    }
    return { repo: result.repo }
  }
  const addRemote = async (
    args: Parameters<DesktopRepoAddServices['addRemote']>[0],
    fromPicker = false
  ): Promise<RepoAddResult> => {
    const result = await addRemoteRepoFromPath(store, args)
    if ('error' in result) {
      return result
    }
    notifyReposChanged(mainWindow)
    if (fromPicker) {
      emitRepoAdded('folder_picker', result.alreadyExisted, result.repo.kind === 'git')
    }
    return { repo: result.repo }
  }
  ipcMain.handle('repos:add', (_event, args: Parameters<DesktopRepoAddServices['addLocal']>[0]) =>
    addLocal(args, true)
  )
  ipcMain.handle(
    'repos:addRemote',
    (_event, args: Parameters<DesktopRepoAddServices['addRemote']>[0]) => addRemote(args, true)
  )
  setDesktopRepoAddForRpc({ addLocal, addRemote })
}
