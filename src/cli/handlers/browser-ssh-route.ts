import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getOptionalStringFlag } from '../flags'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import { printResult } from '../format'
import {
  BrowserSshRouteTarget,
  BrowserSshRouteReceipt
} from '../../shared/rpc-contract/browser-ssh-route-params'
import { requireBrowserViewerConfirmation } from './browser-viewer-command'
const PublicReply = z.object({
  id: z.string(),
  ok: z.literal(true),
  _meta: z.object({ runtimeId: z.string() }),
  result: z.object({ applied: z.literal(true), sshRoute: BrowserSshRouteReceipt })
})
export const BROWSER_SSH_ROUTE_HANDLERS: Record<string, CommandHandler> = {
  'browser ssh-route': async (ctx) => {
    const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
    const action = getRequiredStringFlag(ctx.flags, 'action')
    const parsed = BrowserSshRouteTarget.safeParse({
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      page: getRequiredStringFlag(ctx.flags, 'page'),
      targetId: getRequiredStringFlag(ctx.flags, 'target'),
      profileId: getRequiredStringFlag(ctx.flags, 'profile'),
      ...(action === 'recheck'
        ? {
            errorCode: Number(getRequiredStringFlag(ctx.flags, 'error-code')),
            expectedUrl: getRequiredStringFlag(ctx.flags, 'url')
          }
        : { errorKind: getOptionalStringFlag(ctx.flags, 'error-kind') }),
      action
    })
    if (viewer !== 'host' || !parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify --viewer host and an exact SSH browser routing target.'
      )
    }
    if (parsed.data.action !== 'retry') {
      requireBrowserViewerConfirmation(ctx)
    }
    let result
    try {
      result = await ctx.client.call<unknown>('ui.browserViewer', {
        viewer,
        operation: 'ssh-route',
        target: parsed.data
      })
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support the requested SSH routing action.'
        )
      }
      throw error
    }
    const acknowledgment = PublicReply.safeParse(result)
    const receipt = acknowledgment.success ? acknowledgment.data.result.sshRoute : undefined
    if (
      !acknowledgment.success ||
      !receipt ||
      (parsed.data.action === 'prepare' && receipt.routeState !== 'ready') ||
      Object.entries(parsed.data).some(([key, value]) => Reflect.get(receipt, key) !== value)
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'SSH browser routing action was not acknowledged by its exact viewer owner.'
      )
    }
    printResult(acknowledgment.data, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
