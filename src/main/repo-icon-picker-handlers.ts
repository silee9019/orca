import { ipcMain } from 'electron'
import { pickRepoIconImage } from './repo-icon-image-picker'
import { getRepoPickerRequests } from './repo-picker-service'
import type { RepoPickerRequests } from './repo-picker-requests'
import { setDesktopRepoIconPickerForRpc } from './runtime/rpc/methods/workspace-repo-icon-picker'
export function registerRepoIconPickerHandlers(): RepoPickerRequests {
  const picker = getRepoPickerRequests()
  ipcMain.handle('shell:pickRepoIconImage', () => pickRepoIconImage())
  setDesktopRepoIconPickerForRpc(picker)
  return picker
}
