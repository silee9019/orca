import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import type { Store } from './persistence'
import type { Repo } from '../shared/repo-types'
import { createRemoteRepo } from './ipc/repos/remote-repo-creation'
import { notifyReposChanged } from './ipc/repos/repos-changed-notification'
import { setDesktopRepoCreateRemoteForRpc } from './runtime/rpc/methods/workspace-repo-create-remote'
export type DesktopRepoCreateRemoteService = (args: {
  connectionId: string
  parentPath: string
  name: string
  kind: 'git' | 'folder'
}) => Promise<{ repo: Repo } | { error: string }>
export function registerDesktopRepoCreateRemoteHandlers(
  mainWindow: BrowserWindow,
  store: Store
): void {
  const create = async (
    args: Parameters<DesktopRepoCreateRemoteService>[0],
    fromPicker = false
  ) => {
    const result = await createRemoteRepo(store, args, fromPicker)
    if ('error' in result) {
      return result
    }
    notifyReposChanged(mainWindow)
    return result
  }
  ipcMain.handle(
    'repos:createRemote',
    (_event, args: Parameters<DesktopRepoCreateRemoteService>[0]) => create(args, true)
  )
  setDesktopRepoCreateRemoteForRpc(create)
}
