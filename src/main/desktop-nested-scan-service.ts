import { isAbsolute, posix } from 'node:path'
import type { z } from 'zod'
import type { DesktopNestedScanStart } from '../shared/rpc-contract/workspace-nested-scan-params'
import { DesktopNestedScanController } from './desktop-nested-scan-controller'
import { scanNestedReposForIpc } from './ipc/repos/nested-repo-scan-ipc'
import { getSshGitProvider } from './providers/ssh-git-dispatch'
import { getSshFilesystemProvider } from './providers/ssh-filesystem-dispatch'
import { getSshProviderAuthority } from './ssh/ssh-provider-authority'
import { setDesktopNestedScanForRpc } from './runtime/rpc/methods/workspace-nested-scan'
export type DesktopNestedScanService = {
  controller: DesktopNestedScanController
  start: (
    params: z.infer<typeof DesktopNestedScanStart>
  ) => ReturnType<DesktopNestedScanController['start']>
}
let service: DesktopNestedScanService | null = null
export function registerDesktopNestedScanForRpc(): DesktopNestedScanService {
  if (!service) {
    const controller = new DesktopNestedScanController()
    service = {
      controller,
      start: (params) =>
        controller.start(async (signal, onProgress) => {
          const { path, expectedScanHostId, options } = params
          const connectionId = expectedScanHostId.startsWith('ssh:')
            ? expectedScanHostId.slice(4)
            : undefined
          if (!(connectionId ? posix.isAbsolute(path) : isAbsolute(path))) {
            throw new Error('An absolute selected-host path is required.')
          }
          const git = connectionId ? getSshGitProvider(connectionId) : null
          const files = connectionId ? getSshFilesystemProvider(connectionId) : null
          const authority = connectionId ? getSshProviderAuthority(connectionId) : null
          if (connectionId && (!git || !files)) {
            throw new Error('Selected host unavailable.')
          }
          signal.throwIfAborted()
          const value = await scanNestedReposForIpc({
            path,
            connectionId,
            options,
            signal,
            onProgress
          })
          signal.throwIfAborted()
          if (
            connectionId &&
            (getSshGitProvider(connectionId) !== git ||
              getSshFilesystemProvider(connectionId) !== files ||
              getSshProviderAuthority(connectionId) !== authority)
          ) {
            throw new Error('Selected host changed.')
          }
          return value
        })
    }
  }
  setDesktopNestedScanForRpc(service)
  return service
}
