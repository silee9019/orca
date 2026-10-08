import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserServerReopenCommand,
  BrowserServerReopenState
} from '../../shared/rpc-contract/browser-server-reopen-params'
const Receipt = z.object({ applied: z.literal(true), serverReopen: BrowserServerReopenState })
export const BROWSER_SERVER_REOPEN_HANDLERS: Record<string, CommandHandler> = {
  'browser reopen-server': async (ctx) => {
    if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Server reopen requires the local host viewer.'
      )
    }
    const selected = BrowserServerReopenCommand.safeParse({
      page: getRequiredStringFlag(ctx.flags, 'page'),
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      workspaceId: getRequiredStringFlag(ctx.flags, 'workspace'),
      groupId: getRequiredStringFlag(ctx.flags, 'group'),
      executionHostId: getRequiredStringFlag(ctx.flags, 'execution-host'),
      environmentId: getRequiredStringFlag(ctx.flags, 'runtime-environment'),
      clientTarget: {
        remotePageId: getRequiredStringFlag(ctx.flags, 'remote-page'),
        browserHostClientId: getRequiredStringFlag(ctx.flags, 'browser-host-client'),
        browserHostGeneration: Number(getRequiredStringFlag(ctx.flags, 'browser-host-generation')),
        pageHostGeneration: Number(getRequiredStringFlag(ctx.flags, 'page-host-generation'))
      }
    })
    if (!selected.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid exact server reopen target.')
    }
    const command = selected.data
    let response
    try {
      response = await ctx.client.call<unknown>('ui.browserViewer', {
        viewer: 'host',
        operation: 'server-reopen',
        command
      })
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support server reopen owner receipts.'
        )
      }
      throw error
    }
    const receipt = Receipt.safeParse(response?.result)
    if (
      !receipt.success ||
      Object.entries(command).some(
        ([key, value]) =>
          key !== 'clientTarget' && Reflect.get(receipt.data.serverReopen, key) !== value
      ) ||
      receipt.data.serverReopen.createdRemotePageId === command.clientTarget.remotePageId
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'The exact new server page was not acknowledged.'
      )
    }
    printResult(
      {
        id: response.id,
        ok: true,
        _meta: { runtimeId: response._meta.runtimeId },
        result: receipt.data
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
