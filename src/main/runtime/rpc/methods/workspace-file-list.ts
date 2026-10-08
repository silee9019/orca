import {
  DesktopFileListStart,
  DesktopFileListRequest,
  DesktopFileListResult
} from '../../../../shared/rpc-contract/workspace-file-list-params'
import type { DesktopFileListServices } from '../../../desktop-file-list-requests'
import { defineMethod } from '../core'
let services: DesktopFileListServices | null = null
export function setDesktopFileListForRpc(value: DesktopFileListServices | null): void {
  if (services?.controller !== value?.controller) {
    services?.controller.dispose()
  }
  services = value
}
function requireServices(): DesktopFileListServices {
  if (!services) {
    throw new Error('runtime_unavailable')
  }
  return services
}
export const WORKSPACE_FILE_LIST_METHODS = [
  defineMethod({
    name: 'files.desktopListStart',
    params: DesktopFileListStart,
    handler: (params, ctx) => requireServices().start(params, ctx.runtime)
  }),
  defineMethod({
    name: 'files.desktopListStatus',
    params: DesktopFileListRequest,
    handler: (params) => requireServices().controller.status(params.requestId)
  }),
  defineMethod({
    name: 'files.desktopListCancel',
    params: DesktopFileListRequest,
    handler: (params) => requireServices().controller.cancel(params.requestId)
  }),
  defineMethod({
    name: 'files.desktopListResult',
    params: DesktopFileListResult,
    handler: (params) =>
      requireServices().controller.result(params.requestId, params.offset, params.limit)
  })
]
