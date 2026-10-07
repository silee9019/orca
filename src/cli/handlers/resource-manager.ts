import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { readBoundedCliJsonFile } from '../bounded-json-file'
import { ResourceManagerViewerParams } from '../../shared/rpc-contract/resource-manager-params'
function handler(command: 'status' | 'apply'): CommandHandler {
  return async (ctx) => {
    requireAccountsPermissionsExecutionHost(ctx)
    const { client, flags, json } = ctx
    const action: unknown =
      command === 'status'
        ? { action: 'status' }
        : await readBoundedCliJsonFile(getRequiredStringFlag(flags, 'request-file'), 65536)
    const input = ResourceManagerViewerParams.parse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      action
    })
    const result = await client.call('resourceManager.viewer', input)
    printResult(result, json, (value) => JSON.stringify(value, null, 2))
  }
}
export const RESOURCE_MANAGER_HANDLERS: Record<string, CommandHandler> = {
  'resource-manager status': handler('status'),
  'resource-manager apply': handler('apply')
}
