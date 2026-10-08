import {
  DesktopGitStatusStart,
  DesktopGitStatusRequest,
  DesktopGitStatusResult
} from '../../../../shared/rpc-contract/workspace-git-status-params'
import type { DesktopGitStatusService } from '../../../desktop-git-status-requests'
import { defineMethod } from '../core'
let service: DesktopGitStatusService | null = null
export function setDesktopGitStatusForRpc(value: DesktopGitStatusService | null): void {
  if (service?.controller !== value?.controller) {
    service?.controller.dispose()
  }
  service = value
}
function requireService() {
  if (!service) {
    throw new Error('runtime_unavailable')
  }
  return service
}
export const WORKSPACE_GIT_STATUS_METHODS = [
  defineMethod({
    name: 'git.desktopStatusStart',
    params: DesktopGitStatusStart,
    handler: (params, ctx) => requireService().start(params, ctx.runtime)
  }),
  defineMethod({
    name: 'git.desktopStatusStatus',
    params: DesktopGitStatusRequest,
    handler: (params) => requireService().controller.status(params.requestId)
  }),
  defineMethod({
    name: 'git.desktopStatusCancel',
    params: DesktopGitStatusRequest,
    handler: (params) => requireService().controller.cancel(params.requestId)
  }),
  defineMethod({
    name: 'git.desktopStatusResult',
    params: DesktopGitStatusResult,
    handler: (params) =>
      requireService().controller.result(params.requestId, params.offset, params.limit)
  })
]
