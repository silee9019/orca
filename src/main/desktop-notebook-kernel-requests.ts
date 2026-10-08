import { realpath } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import type { z } from 'zod'
import type { Store } from './persistence'
import type { DesktopNotebookKernelStart } from '../shared/rpc-contract/workspace-notebook-kernel-params'
import { isWslUncPath } from '../shared/wsl-paths'
import { resolveUserNamedRegularFile } from './ipc/local-file-access-resolution'
import { startNotebookKernel } from './notebook/notebook-kernel'
import { DesktopNotebookKernelController } from './desktop-notebook-kernel-controller'
import { setDesktopNotebookKernelForRpc } from './runtime/rpc/methods/workspace-notebook-kernel'
export type DesktopNotebookKernelService = {
  controller: DesktopNotebookKernelController
  start: (
    params: z.infer<typeof DesktopNotebookKernelStart>
  ) => ReturnType<DesktopNotebookKernelController['start']>
}
const controllers = new WeakMap<Store, DesktopNotebookKernelController>()
export function registerDesktopNotebookKernelForRpc(store: Store): void {
  let controller = controllers.get(store)
  if (!controller) {
    controller = new DesktopNotebookKernelController()
    controllers.set(store, controller)
  }
  const kernels = controller
  setDesktopNotebookKernelForRpc({
    controller: kernels,
    start: (params) =>
      kernels.start(async (signal, onFrame, onProtocolFailure) => {
        if (
          ![params.filePath, params.python].every((path) => isAbsolute(path) && !isWslUncPath(path))
        ) {
          throw new Error('Unsupported native notebook path.')
        }
        signal.throwIfAborted()
        const path = await realpath(await resolveUserNamedRegularFile(params.filePath, store))
        signal.throwIfAborted()
        return startNotebookKernel({
          python: params.python,
          cwd: dirname(path),
          onFrame,
          framePolicy: { maxLineBytes: 1024 * 1024, onProtocolFailure }
        })
      })
  })
}
