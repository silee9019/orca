import { isAbsolute } from 'node:path'
import type { z } from 'zod'
import type { Store } from './persistence'
import type { RemoteFolderDownloadStart } from '../shared/rpc-contract/workspace-remote-folder-download-params'
import { isWslUncPath } from '../shared/wsl-paths'
import { resolveLocalWriteRequestPath } from './ipc/local-file-access-resolution'
import { requireSshFilesystemProvider } from './providers/ssh-filesystem-dispatch'
import { RemoteFolderDownloadController } from './remote-folder-download-controller'
import { setRemoteFolderDownloadForRpc } from './runtime/rpc/methods/workspace-remote-folder-download'
export type RemoteFolderDownloadService = {
  controller: RemoteFolderDownloadController
  start: (
    params: z.infer<typeof RemoteFolderDownloadStart>
  ) => ReturnType<RemoteFolderDownloadController['start']>
}
const controllers = new WeakMap<Store, RemoteFolderDownloadController>()
export function registerRemoteFolderDownloadForRpc(store: Store): void {
  let controller = controllers.get(store)
  if (!controller) {
    controller = new RemoteFolderDownloadController()
    controllers.set(store, controller)
  }
  const requests = controller
  setRemoteFolderDownloadForRpc({
    controller: requests,
    start: (params) => {
      const provider = requireSshFilesystemProvider(params.connectionId)
      const downloadFolder = provider.downloadFolder?.bind(provider)
      if (!downloadFolder) {
        throw new Error('Remote folder download is unavailable.')
      }
      return requests.start(
        async () => {
          if (!isAbsolute(params.destinationPath) || isWslUncPath(params.destinationPath)) {
            throw new Error('Unsupported native download destination.')
          }
          return resolveLocalWriteRequestPath(params.destinationPath, { kind: 'user-file' }, store)
        },
        (tempPath, signal) => downloadFolder(params.dirPath, tempPath, { signal })
      )
    }
  })
}
