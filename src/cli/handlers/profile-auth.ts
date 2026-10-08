import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'

async function runProfileAuth(ctx: HandlerContext, action: string): Promise<void> {
  requireAccountsPermissionsExecutionHost(ctx)
  rejectRemoteSelectionFlags(
    ctx.flags,
    '`orca profile auth`. Run it on the host whose profile you want to manage.'
  )
  if (action === 'sign-out' && ctx.flags.get('confirm') !== 'true') {
    throw new RuntimeClientError('invalid_argument', 'Signing out requires --confirm true.')
  }
  const orgId = ctx.flags.get('org-id')
  if (action === 'select-org' && (typeof orgId !== 'string' || !orgId.trim())) {
    throw new RuntimeClientError('invalid_argument', 'Use --org-id <id>.')
  }
  const result = await ctx.client.call('profileAuth.control', {
    action,
    ...(action === 'sign-out' ? { confirm: true } : {}),
    ...(action === 'select-org' ? { orgId } : {})
  })
  printResult(result, ctx.json, (state) => JSON.stringify(state, null, 2))
}

export const PROFILE_AUTH_HANDLERS: Record<string, CommandHandler> = {
  'profile auth start': (ctx) => runProfileAuth(ctx, 'start'),
  'profile auth status': (ctx) => runProfileAuth(ctx, 'status'),
  'profile auth cancel': (ctx) => runProfileAuth(ctx, 'cancel'),
  'profile auth refresh': (ctx) => runProfileAuth(ctx, 'refresh'),
  'profile auth sign-out': (ctx) => runProfileAuth(ctx, 'sign-out'),
  'profile auth select-org': (ctx) => runProfileAuth(ctx, 'select-org')
}
