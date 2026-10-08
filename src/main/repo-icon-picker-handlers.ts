import { ipcMain } from 'electron'
import { pickRepoIconImage } from './repo-icon-image-picker'
import { RepoIconPickerRequests } from './repo-icon-picker-requests'
import { setDesktopRepoIconPickerForRpc } from './runtime/rpc/methods/workspace-repo-icon-picker'
export function registerRepoIconPickerHandlers(): RepoIconPickerRequests {
  const picker = new RepoIconPickerRequests((signal) => pickRepoIconImage(signal))
  ipcMain.handle('shell:pickRepoIconImage', () => pickRepoIconImage())
  setDesktopRepoIconPickerForRpc(picker)
  return picker
}
