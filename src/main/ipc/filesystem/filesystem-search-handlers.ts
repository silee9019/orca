import { registerDesktopFileSearchForRpc } from '../../desktop-file-search-requests'
import { ipcMain } from 'electron'
import type { FilesystemHandlerContext } from './filesystem-handler-context'
import { registerFilesystemContentSearchHandler } from './filesystem-content-search-handler'
import { listDesktopFiles, type DesktopFileListArgs } from '../../desktop-file-listing'
import { registerDesktopFileListForRpc } from '../../desktop-file-list-requests'
export function registerFilesystemSearchHandlers(context: FilesystemHandlerContext): void {
  registerFilesystemContentSearchHandler(context)
  const { store, listFilesCancellations } = context
  registerDesktopFileListForRpc(store)
  registerDesktopFileSearchForRpc(store)
  ipcMain.handle(
    'fs:listFiles',
    async (event, args: DesktopFileListArgs & { requestToken?: string }): Promise<string[]> => {
      const controller = listFilesCancellations.begin(event, args.requestToken)
      try {
        return await listDesktopFiles(store, args, controller?.signal)
      } finally {
        listFilesCancellations.finish(event, args.requestToken, controller)
      }
    }
  )
  ipcMain.handle('fs:cancelListFiles', (event, args: { requestToken: string }): void => {
    listFilesCancellations.cancel(event, args.requestToken)
  })
}
