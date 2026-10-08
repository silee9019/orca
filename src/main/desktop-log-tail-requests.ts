import { isAbsolute } from 'node:path'
import type { z } from 'zod'
import type { Store } from './persistence'
import type {
  DesktopLogTailStart,
  DesktopLogTailRead
} from '../shared/rpc-contract/workspace-log-tail-params'
import { isWslUncPath } from '../shared/wsl-paths'
import { readLocalLogTailRange } from './ai-vault/local-log-tail-reader'
import { resolveUserNamedRegularFile } from './ipc/local-file-access-resolution'
import { DesktopLogTailController } from './desktop-log-tail-controller'
import { setDesktopLogTailForRpc } from './runtime/rpc/methods/workspace-log-tail'
export type DesktopLogTailService = {
  controller: DesktopLogTailController
  start: (
    params: z.infer<typeof DesktopLogTailStart>
  ) => ReturnType<DesktopLogTailController['start']>
  read: (params: z.infer<typeof DesktopLogTailRead>) => ReturnType<typeof readLocalLogTailRange>
}
const controllers = new WeakMap<Store, DesktopLogTailController>()
export function registerDesktopLogTailForRpc(store: Store): void {
  let controller = controllers.get(store)
  if (!controller) {
    controller = new DesktopLogTailController()
    controllers.set(store, controller)
  }
  const tails = controller
  const authorize = async (path: string) => {
    if (!isAbsolute(path) || isWslUncPath(path)) {
      throw new Error('Unsupported native log path.')
    }
    return resolveUserNamedRegularFile(path, store)
  }
  setDesktopLogTailForRpc({
    controller: tails,
    start: (params) =>
      tails.start(async (signal) => {
        signal.throwIfAborted()
        const path = await authorize(params.filePath)
        signal.throwIfAborted()
        return path
      }),
    read: async (params) =>
      readLocalLogTailRange(
        await authorize(params.filePath),
        params.fromByteOffset,
        params.expectedIdentity
      )
  })
}
