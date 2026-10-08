import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import type { Store } from '../../persistence'
import { cloneLocalRepo } from '../../desktop-local-clone'
import { abortRendererLocalClone } from '../../desktop-local-clone-lifecycle'
import { registerDesktopLocalCloneForRpc } from '../../desktop-local-clone-service'
import { registerDesktopRemoteCloneForRpc } from '../../desktop-remote-clone-service'
import { notifyReposChanged } from './repos-changed-notification'
import { abortActiveRemoteClone, cloneRemoteRepo } from './remote-repo-clone'
export function registerRepoCloneHandlers(mainWindow: BrowserWindow, store: Store): void {
  registerDesktopLocalCloneForRpc(store, mainWindow)
  registerDesktopRemoteCloneForRpc(store, mainWindow, () => notifyReposChanged(mainWindow))
  ipcMain.handle('repos:cloneAbort', async () => {
    abortRendererLocalClone()
    abortActiveRemoteClone()
  })
  ipcMain.handle('repos:clone', async (_event, args: { url: string; destination: string }) =>
    cloneLocalRepo(store, mainWindow, args)
  )
  ipcMain.handle(
    'repos:cloneRemote',
    async (_event, args: { connectionId: string; url: string; destination: string }) => {
      const repo = await cloneRemoteRepo(store, mainWindow, args)
      notifyReposChanged(mainWindow)
      return repo
    }
  )
}
