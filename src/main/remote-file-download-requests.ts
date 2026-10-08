import { isAbsolute } from 'node:path'
import type { z } from 'zod'
import type { Store } from './persistence'
import type { RemoteFileDownloadStart } from '../shared/rpc-contract/workspace-remote-file-download-params'
import { isWslUncPath } from '../shared/wsl-paths'
import { resolveLocalWriteRequestPath } from './ipc/local-file-access-resolution'
import { NativeDownloadStagingFile } from './native-download-staging-file'
import { requireSshFilesystemProvider } from './providers/ssh-filesystem-dispatch'
import { RemoteDownloadController } from './remote-download-controller'
import { setRemoteFileDownloadForRpc } from './runtime/rpc/methods/workspace-remote-file-download'
export type RemoteFileDownloadService = {
  controller: RemoteDownloadController
  start: (
    params: z.infer<typeof RemoteFileDownloadStart>
  ) => ReturnType<RemoteDownloadController['start']>
}
const controllers = new WeakMap<Store, RemoteDownloadController>()
export function registerRemoteFileDownloadForRpc(store: Store): void {
  let controller = controllers.get(store)
  if (!controller) {
    controller = new RemoteDownloadController('remote_file_download_busy')
    controllers.set(store, controller)
  }
  const requests = controller
  setRemoteFileDownloadForRpc({
    controller: requests,
    start: (params) => {
      const provider = requireSshFilesystemProvider(params.connectionId)
      const downloadFile = provider.downloadFile?.bind(provider)
      if (!downloadFile) {
        throw new Error('Remote file download is unavailable.')
      }
      return requests.start(
        async () => {
          if (!isAbsolute(params.destinationPath) || isWslUncPath(params.destinationPath)) {
            throw new Error('Unsupported native download destination.')
          }
          const destination = await resolveLocalWriteRequestPath(
            params.destinationPath,
            { kind: 'user-file' },
            store
          )
          if ((await provider.stat(params.filePath)).type === 'directory') {
            throw new Error('Cannot download a directory')
          }
          return destination
        },
        (tempPath) => downloadFile(params.filePath, tempPath),
        (destination) => {
          const staging = new NativeDownloadStagingFile(destination)
          return {
            create: () => staging.reserve(params.overwrite === true),
            promote: (signal) => staging.promote(signal),
            cleanup: () => staging.cleanup()
          }
        }
      )
    }
  })
}
