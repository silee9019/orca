import { isAbsolute } from 'node:path'
import type { z } from 'zod'
import type { Store } from './persistence'
import type {
  DesktopDownloadSessionStart,
  DesktopSaveDownloadedFile
} from '../shared/rpc-contract/workspace-download-session-params'
import { isWslUncPath } from '../shared/wsl-paths'
import { resolveLocalWriteRequestPath } from './ipc/local-file-access-resolution'
import { DesktopDownloadSessionController } from './desktop-download-session-controller'
import { setDesktopDownloadSessionForRpc } from './runtime/rpc/methods/workspace-download-session'
export type DesktopDownloadSessionService = {
  controller: DesktopDownloadSessionController
  save: (
    params: z.infer<typeof DesktopSaveDownloadedFile>,
    signal?: AbortSignal
  ) => ReturnType<DesktopDownloadSessionController['save']>
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
  const authorize = async (destinationPath: string): Promise<string> => {
    if (!isAbsolute(destinationPath) || isWslUncPath(destinationPath)) {
      throw new Error('Unsupported native download destination.')
    }
    return resolveLocalWriteRequestPath(destinationPath, { kind: 'user-file' }, store)
  }
  setDesktopDownloadSessionForRpc({
    controller: sessions,
    start: (params) => sessions.start(() => authorize(params.destinationPath), params.overwrite),
    save: (params, signal) =>
      sessions.save(
        () => authorize(params.destinationPath),
        params.overwrite,
        params.content,
        params.encoding,
        signal
      )
  })
}
