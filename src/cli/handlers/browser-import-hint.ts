import { resolve } from 'node:path'
import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import {
  BrowserImportHintCommand,
  BrowserImportHintState
} from '../../shared/rpc-contract/browser-import-hint-params'
const publicReply = z.object({
  id: z.string(),
  ok: z.literal(true),
  _meta: z.object({ runtimeId: z.string() }),
  result: z.object({ applied: z.literal(true), browserImportHint: BrowserImportHintState })
})
export const BROWSER_IMPORT_HINT_HANDLERS: Record<string, CommandHandler> = {
  'browser import-hint': async (ctx) => {
    const action = getRequiredStringFlag(ctx.flags, 'action')
    const command = BrowserImportHintCommand.safeParse({
      ...(action === 'import-file'
        ? {
            filePath: resolve(ctx.cwd, getRequiredStringFlag(ctx.flags, 'file')),
            confirmProfile: getRequiredStringFlag(ctx.flags, 'confirm-profile')
          }
        : {}),
      ...(action === 'hide' ? { confirm: getRequiredStringFlag(ctx.flags, 'confirm') } : {}),
      hostId: getRequiredStringFlag(ctx.flags, 'host'),
      pageId: getRequiredStringFlag(ctx.flags, 'page'),
      profileId: getRequiredStringFlag(ctx.flags, 'profile'),
      action
    })
    if (!command.success || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify the exact host viewer, host, page, profile and action.'
      )
    }
    const response = await ctx.client.call<unknown>('ui.browserViewer', {
      viewer: 'host',
      operation: 'browser-import-hint',
      command: command.data
    })
    const reply = publicReply.safeParse(response)
    if (
      !reply.success ||
      (action === 'import-file' && !reply.data.result.browserImportHint.imported) ||
      (action === 'hide' &&
        (!reply.data.result.browserImportHint.hidden ||
          !reply.data.result.browserImportHint.persisted))
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Browser import hint did not acknowledge the action.'
      )
    }
    printResult(reply.data, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
