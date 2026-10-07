import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import { resolve } from 'node:path'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { AccountMountedViewerActionSchema } from '../../shared/account-mounted-viewer-command'
import { readCredentialInput } from './account-credentials'

export const ACCOUNT_MOUNTED_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'account-view mounted': async (ctx) => {
    requireAccountsPermissionsExecutionHost(ctx)
    if (ctx.flags.get('viewer') !== 'desktop') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --viewer desktop for mounted account forms.'
      )
    }
    const input = ctx.flags.get('input-file')
    if (typeof input !== 'string' || !input || (input === '-' && process.stdin.isTTY)) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --input-file <path|-> or pipe the account form action to stdin.'
      )
    }
    let value: unknown
    try {
      value = JSON.parse(readCredentialInput(input === '-' ? 0 : resolve(ctx.cwd, input)))
    } catch {
      throw new RuntimeClientError(
        'invalid_argument',
        'Could not read an account form action JSON object of at most 65536 bytes.'
      )
    }
    const action = AccountMountedViewerActionSchema.safeParse(value)
    if (!action.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Provide a supported typed account form action JSON object.'
      )
    }
    const response = await ctx.client
      .call('accounts.viewerAction', { viewer: 'desktop', action: action.data })
      .catch(() => {
        throw new RuntimeClientError(
          'internal',
          'The mounted account action failed or its form is unavailable in this viewer.'
        )
      })
    const receipt = { status: 'accepted' }
    printResult({ ...response, result: receipt }, ctx.json, (result) => JSON.stringify(result))
  }
}
