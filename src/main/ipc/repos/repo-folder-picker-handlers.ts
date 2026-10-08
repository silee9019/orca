import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { pickRepoFolderSelection } from '../../repo-folder-selection'
import { getRepoPickerRequests, setRepoFolderSelectionPicker } from '../../repo-picker-service'
import { setDesktopRepoFolderPickerForRpc } from '../../runtime/rpc/methods/workspace-repo-folder-picker'
export function registerRepoFolderPickerHandlers(mainWindow: BrowserWindow): void {
  setRepoFolderSelectionPicker((kind, signal) => pickRepoFolderSelection(mainWindow, kind, signal))
  setDesktopRepoFolderPickerForRpc(getRepoPickerRequests())
  ipcMain.handle(
    'repos:pickFolder',
    async () => (await pickRepoFolderSelection(mainWindow, 'folder'))?.paths[0] ?? null
  )
  ipcMain.handle(
    'repos:pickFolders',
    async () => (await pickRepoFolderSelection(mainWindow, 'folders'))?.paths ?? []
  )
  ipcMain.handle(
    'repos:pickDirectory',
    async () => (await pickRepoFolderSelection(mainWindow, 'directory'))?.paths[0] ?? null
  )
}
