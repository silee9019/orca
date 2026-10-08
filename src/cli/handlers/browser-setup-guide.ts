import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import {
  BrowserSetupGuideCommand,
  BrowserSetupGuideState
} from '../../shared/rpc-contract/browser-setup-guide-params'
import { z } from 'zod'
const publicReply = z.object({
  id: z.string(),
  ok: z.literal(true),
  _meta: z.object({ runtimeId: z.string() }),
  result: z.object({ applied: z.literal(true), browserSetupGuide: BrowserSetupGuideState })
})
export const BROWSER_SETUP_GUIDE_HANDLERS: Record<string, CommandHandler> = {
  'browser setup-guide': async (ctx) => {
    const workspace = getRequiredStringFlag(ctx.flags, 'workspace')
    const action = getRequiredStringFlag(ctx.flags, 'action')
    const nullableFlag = (name: string): string | null => {
      const value = getRequiredStringFlag(ctx.flags, name)
      return value === 'none' ? null : value
    }
    const command = BrowserSetupGuideCommand.safeParse({
      action,
      surface: getRequiredStringFlag(ctx.flags, 'surface'),
      runtime: getRequiredStringFlag(ctx.flags, 'runtime'),
      workspaceId: workspace === 'none' ? null : workspace,
      ...(action === 'try-it'
        ? { targetWorkspaceId: nullableFlag('target-workspace'), groupId: nullableFlag('group') }
        : {}),
      ...(action === 'prepare-install'
        ? { confirm: getRequiredStringFlag(ctx.flags, 'confirm') }
        : {})
    })
    if (!command.success || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify the exact host viewer, surface, local runtime, workspace and setup confirmation.'
      )
    }
    const result = await ctx.client.call<unknown>('ui.browserViewer', {
      viewer: 'host',
      operation: 'browser-setup-guide',
      command: command.data
    })
    const reply = publicReply.safeParse(result)
    if (
      !reply.success ||
      (action !== 'try-it' && reply.data.result.browserSetupGuide.commandPrepared === undefined) ||
      (action === 'prepare-install' && !reply.data.result.browserSetupGuide.commandPrepared) ||
      (action === 'try-it' &&
        !reply.data.result.browserSetupGuide.browserOpened &&
        !reply.data.result.browserSetupGuide.projectPrompted)
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Browser Use setup guide did not acknowledge the action.'
      )
    }
    printResult(reply.data, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
