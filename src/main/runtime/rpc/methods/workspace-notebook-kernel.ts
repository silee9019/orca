import {
  DesktopNotebookKernelStart,
  DesktopNotebookKernelRequest,
  DesktopNotebookKernelExecute,
  DesktopNotebookKernelFrames
} from '../../../../shared/rpc-contract/workspace-notebook-kernel-params'
import type { DesktopNotebookKernelService } from '../../../desktop-notebook-kernel-requests'
import { defineMethod } from '../core'
let service: DesktopNotebookKernelService | null = null
export function setDesktopNotebookKernelForRpc(value: DesktopNotebookKernelService | null): void {
  if (service?.controller !== value?.controller) {
    service?.controller.dispose()
  }
  service = value
}
function requireService(): DesktopNotebookKernelService {
  if (!service) {
    throw new Error('runtime_unavailable')
  }
  return service
}
export const WORKSPACE_NOTEBOOK_KERNEL_METHODS = [
  defineMethod({
    name: 'notebook.desktopKernelStart',
    params: DesktopNotebookKernelStart,
    handler: (params) => requireService().start(params)
  }),
  defineMethod({
    name: 'notebook.desktopKernelStatus',
    params: DesktopNotebookKernelRequest,
    handler: (params) => requireService().controller.status(params.requestId)
  }),
  defineMethod({
    name: 'notebook.desktopKernelExecute',
    params: DesktopNotebookKernelExecute,
    handler: (params) => requireService().controller.execute(params.requestId, params.code)
  }),
  defineMethod({
    name: 'notebook.desktopKernelInterrupt',
    params: DesktopNotebookKernelRequest,
    handler: (params) => requireService().controller.interrupt(params.requestId)
  }),
  defineMethod({
    name: 'notebook.desktopKernelShutdown',
    params: DesktopNotebookKernelRequest,
    handler: (params) => requireService().controller.shutdown(params.requestId)
  }),
  defineMethod({
    name: 'notebook.desktopKernelFrames',
    params: DesktopNotebookKernelFrames,
    handler: (params) =>
      requireService().controller.frames(params.requestId, params.afterSequence, params.limit)
  })
]
