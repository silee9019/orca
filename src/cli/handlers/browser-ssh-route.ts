import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'
import {
  BrowserSshRouteTarget,
  BrowserSshRouteReceipt
} from '../../shared/rpc-contract/browser-ssh-route-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
import { requireBrowserViewerConfirmation } from './browser-viewer-command'
export const BROWSER_SSH_ROUTE_HANDLERS: Record<string, CommandHandler> = {
  'browser ssh-route': async (ctx) => {
    const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
    const parsed = BrowserSshRouteTarget.safeParse({
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      page: getRequiredStringFlag(ctx.flags, 'page'),
      targetId: getRequiredStringFlag(ctx.flags, 'target'),
      profileId: getRequiredStringFlag(ctx.flags, 'profile'),
      errorKind: getRequiredStringFlag(ctx.flags, 'error-kind'),
      action: getRequiredStringFlag(ctx.flags, 'action')
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
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer,
      operation: 'ssh-route',
      target: parsed.data
    })
    const acknowledgment = BrowserSshRouteReceipt.safeParse(result.result.sshRoute)
    const receipt = acknowledgment.success ? acknowledgment.data : undefined
    if (
      !result.result.applied ||
      !receipt?.accepted ||
      !Number.isInteger(receipt.attempt) ||
      receipt.attempt < 0 ||
      Object.entries(parsed.data).some(([key, value]) => Reflect.get(receipt, key) !== value)
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'SSH browser routing action was not acknowledged by its exact viewer owner.'
      )
    }
    printResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
