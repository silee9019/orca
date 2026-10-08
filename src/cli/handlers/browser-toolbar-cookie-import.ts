import { resolve } from 'node:path'
import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { BrowserProfileUiState } from '../../shared/rpc-contract/browser-profile-ui-params'
import { BrowserViewerCommand } from '../../shared/rpc-contract/browser-viewer-params'
import { requireBrowserViewerConfirmation } from './browser-viewer-command'

const publicReply = z.object({
  id: z.string(),
  ok: z.literal(true),
  _meta: z.object({ runtimeId: z.string() }),
  result: z.object({ applied: z.literal(true), profileUi: BrowserProfileUiState })
})
export const runBrowserToolbarCookieImport: CommandHandler = async (ctx) => {
  requireBrowserViewerConfirmation(ctx)
  const action = getRequiredStringFlag(ctx.flags, 'action')
  const profile = getRequiredStringFlag(ctx.flags, 'profile')
  const command = BrowserViewerCommand.safeParse({
    operation: 'profile-ui',
    viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
    page: getRequiredStringFlag(ctx.flags, 'page'),
    command: {
      action,
      profile,
      ...(action === 'import-file'
        ? { filePath: resolve(ctx.cwd, getRequiredStringFlag(ctx.flags, 'file')) }
        : {
            family: getRequiredStringFlag(ctx.flags, 'family'),
            browserProfile: getOptionalStringFlag(ctx.flags, 'browser-profile')
          })
    }
  })
  if (!command.success) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Specify the exact host viewer, page and profile.'
    )
  }
  const status = publicReply.safeParse(
    await ctx.client.call<unknown>('ui.browserViewer', {
      operation: 'profile-ui',
      viewer: 'host',
      page: getRequiredStringFlag(ctx.flags, 'page'),
      command: { action: 'status' }
    })
  )
  if (
    !status.success ||
    status.data.result.profileUi.cookieImportTargetGuard !== 1 ||
    status.data.result.profileUi.profile !== profile
  ) {
    throw new RuntimeClientError(
      'runtime_error',
      'Viewer cannot confirm this exact import target; no import was requested.'
    )
  }
  const response = await ctx.client.call<unknown>('ui.browserViewer', command.data)
  const reply = publicReply.safeParse(response)
  if (!reply.success || reply.data.result.profileUi.cookieImport?.profile !== profile) {
    throw new RuntimeClientError(
      'runtime_error',
      'Toolbar cookie import did not acknowledge the profile.'
    )
  }
  printResult(reply.data, ctx.json, (value) => JSON.stringify(value, null, 2))
}
