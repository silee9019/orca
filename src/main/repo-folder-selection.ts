import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'
import type { RepoFolderPickerKind, RepoFolderSelection } from '../shared/repo-picker-types'
export async function pickRepoFolderSelection(
  mainWindow: BrowserWindow,
  kind: RepoFolderPickerKind,
  signal?: AbortSignal
): Promise<RepoFolderSelection | null> {
  if (signal?.aborted) {
    return null
  }
  // Native directory creation can leave typed path prefixes behind on macOS.
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: kind === 'folders' ? ['openDirectory', 'multiSelections'] : ['openDirectory']
  })
  if (signal?.aborted || result.canceled || result.filePaths.length === 0) {
    return null
  }
  return { kind, paths: kind === 'folders' ? result.filePaths : [result.filePaths[0]] }
}
