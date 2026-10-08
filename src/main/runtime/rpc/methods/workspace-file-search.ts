import {
  DesktopFileSearchStart,
  DesktopFileSearchRequest,
  DesktopFileSearchResult
} from '../../../../shared/rpc-contract/workspace-file-search-params'
import type { DesktopFileSearchServices } from '../../../desktop-file-search-requests'
import { defineMethod } from '../core'
let services: DesktopFileSearchServices | null = null
export function setDesktopFileSearchForRpc(value: DesktopFileSearchServices | null): void {
  if (services?.controller !== value?.controller) {
    services?.controller.dispose()
  }
  services = value
}
function requireServices(): DesktopFileSearchServices {
  if (!services) {
    throw new Error('runtime_unavailable')
  }
  return services
}
export const WORKSPACE_FILE_SEARCH_METHODS = [
  defineMethod({
    name: 'files.desktopSearchStart',
    params: DesktopFileSearchStart,
    handler: (params, ctx) => requireServices().start(params, ctx.runtime)
  }),
  defineMethod({
    name: 'files.desktopSearchStatus',
    params: DesktopFileSearchRequest,
    handler: (params) => requireServices().controller.status(params.requestId)
  }),
  defineMethod({
    name: 'files.desktopSearchCancel',
    params: DesktopFileSearchRequest,
    handler: (params) => requireServices().controller.cancel(params.requestId)
  }),
  defineMethod({
    name: 'files.desktopSearchResult',
    params: DesktopFileSearchResult,
    handler: (params) =>
      requireServices().controller.result(params.requestId, params.offset, params.limit)
  })
]
