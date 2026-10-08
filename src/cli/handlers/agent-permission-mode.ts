import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'

async function runAgentPermissionMode(
  ctx: HandlerContext,
  action: 'status' | 'set'
): Promise<void> {
  requireAccountsPermissionsExecutionHost(ctx)
  rejectRemoteSelectionFlags(
    ctx.flags,
    '`orca agent-permissions`. Run it on the settings owner host.'
  )
  const mode = ctx.flags.get('mode')
  if (action === 'set' && mode !== 'yolo' && mode !== 'manual') {
    throw new RuntimeClientError('invalid_argument', 'Use --mode yolo or --mode manual.')
  }
  const result = await ctx.client.call<{ mode: string }>('agentPermissionMode.control', {
    action,
    ...(action === 'set' ? { mode } : {})
  })
  printResult(result, ctx.json, (state) => state.mode)
}

export const AGENT_PERMISSION_MODE_HANDLERS: Record<string, CommandHandler> = {
  'agent-permissions status': (ctx) => runAgentPermissionMode(ctx, 'status'),
  'agent-permissions set': (ctx) => runAgentPermissionMode(ctx, 'set')
}
