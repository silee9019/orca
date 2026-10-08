import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserToolbarExternalCommand,
  BrowserToolbarExternalState
} from '../../shared/rpc-contract/browser-toolbar-external-params'
const Receipt = z.object({ applied: z.literal(true), toolbarExternal: BrowserToolbarExternalState })
const open: CommandHandler = async (ctx) => {
  if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
    throw new RuntimeClientError(
      'invalid_argument',
      'Native toolbar external commands require the local host viewer.'
    )
  }
  const selected = BrowserToolbarExternalCommand.safeParse({
    page: getRequiredStringFlag(ctx.flags, 'page'),
    worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
    workspaceId: getRequiredStringFlag(ctx.flags, 'workspace'),
    groupId: getRequiredStringFlag(ctx.flags, 'group'),
    executionHostId: getRequiredStringFlag(ctx.flags, 'execution-host'),
    url: getRequiredStringFlag(ctx.flags, 'url')
  })
  if (!selected.success) {
    throw new RuntimeClientError('invalid_argument', 'Invalid exact native toolbar target.')
  }
  const command = selected.data
  let response
  try {
    response = await ctx.client.call<unknown>('ui.browserViewer', {
      viewer: 'host',
      operation: 'toolbar-external',
      command
    })
  } catch (error) {
    if (
      error instanceof RuntimeRpcFailureError &&
      ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
    ) {
      throw new RuntimeClientError(
        'incompatible_runtime',
        'This runtime does not support native toolbar external receipts.'
      )
    }
    throw error
  }
  const receipt = Receipt.safeParse(response?.result)
  if (
    !receipt.success ||
    Object.entries(command).some(
      ([key, value]) => Reflect.get(receipt.data.toolbarExternal, key) !== value
    )
  ) {
    throw new RuntimeClientError(
      'runtime_error',
      'The exact native toolbar receipt is malformed or unavailable.'
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
export const BROWSER_TOOLBAR_EXTERNAL_HANDLERS: Record<string, CommandHandler> = {
  'browser toolbar-external': open
}
