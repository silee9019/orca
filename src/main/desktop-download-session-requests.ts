import { isAbsolute } from 'node:path'
import type { z } from 'zod'
import type { Store } from './persistence'
import type { DesktopDownloadSessionStart } from '../shared/rpc-contract/workspace-download-session-params'
import { isWslUncPath } from '../shared/wsl-paths'
import { resolveLocalWriteRequestPath } from './ipc/local-file-access-resolution'
import { DesktopDownloadSessionController } from './desktop-download-session-controller'
import { setDesktopDownloadSessionForRpc } from './runtime/rpc/methods/workspace-download-session'
export type DesktopDownloadSessionService = {
  controller: DesktopDownloadSessionController
  start: (
    params: z.infer<typeof DesktopDownloadSessionStart>
  ) => ReturnType<DesktopDownloadSessionController['start']>
}
const controllers = new WeakMap<Store, DesktopDownloadSessionController>()
export function registerDesktopDownloadSessionForRpc(store: Store): void {
  let controller = controllers.get(store)
  if (!controller) {
    controller = new DesktopDownloadSessionController()
    controllers.set(store, controller)
  }
  const sessions = controller
  setDesktopDownloadSessionForRpc({
    controller: sessions,
    start: (params) =>
      sessions.start(async () => {
        if (!isAbsolute(params.destinationPath) || isWslUncPath(params.destinationPath)) {
          throw new Error('Unsupported native download destination.')
        }
        return resolveLocalWriteRequestPath(params.destinationPath, { kind: 'user-file' }, store)
      }, params.overwrite)
  })
}
