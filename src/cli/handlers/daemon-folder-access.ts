import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import { readAgentSessionRequest } from './agent-session-request'
import {
  DaemonFolderAccessPlan,
  DaemonFolderAccessReceipt,
  DaemonFolderAccessStartParams,
  DaemonFolderAccessStatusParams,
  DaemonFolderAccessCancelParams,
  DaemonFolderAccessVerifyParams
} from '../../shared/rpc-contract/daemon-folder-access-params'

function invalid(): never {
  throw new RuntimeClientError(
    'invalid_runtime_response',
    'The host returned an invalid folder permission receipt.'
  )
}
export const DAEMON_FOLDER_ACCESS_HANDLERS: Record<string, CommandHandler> = {
  'terminal daemon folder-access-plan': async (ctx) => {
    const response = await ctx.client.call('daemon.folderAccessPlan', {})
    const plan = DaemonFolderAccessPlan.safeParse(response.result)
    if (!plan.success || plan.data.runtimeId !== response._meta.runtimeId) {
      invalid()
    }
    printResult({ ...response, result: plan.data }, ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  }
}
for (const [action, method, schema] of [
  ['start', 'daemon.folderAccessStart', DaemonFolderAccessStartParams],
  ['status', 'daemon.folderAccessStatus', DaemonFolderAccessStatusParams],
  ['cancel', 'daemon.folderAccessCancel', DaemonFolderAccessCancelParams],
  ['complete', 'daemon.folderAccessVerify', DaemonFolderAccessVerifyParams]
] as const) {
  DAEMON_FOLDER_ACCESS_HANDLERS[`terminal daemon folder-access-${action}`] = async (ctx) => {
    const params = await readAgentSessionRequest(ctx, schema)
    const response = await ctx.client.call(method, params)
    const parsed = DaemonFolderAccessReceipt.safeParse(response.result)
    if (!parsed.success || response._meta.runtimeId !== params.runtimeId) {
      invalid()
    }
    const pin = DaemonFolderAccessStatusParams.strip().parse(params),
      result = parsed.data
    if (Object.entries(pin).some(([key, value]) => Reflect.get(result, key) !== value)) {
      invalid()
    }
    if (action === 'complete' && !result.permissionConfirmed) {
      throw new RuntimeClientError(
        'folder_access_unconfirmed',
        'The fresh-daemon probe did not confirm folder access.',
        result
      )
    }
    printResult({ ...response, result }, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
