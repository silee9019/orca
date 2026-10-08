import type { HandlerContext } from './dispatch'
import { RuntimeClientError } from './runtime-client'
import { getWslAccountTarget } from './handlers/account-wsl-location'

export function requireAccountsPermissionsExecutionHost(ctx: HandlerContext): void {
  for (const flag of ['browser', 'page', 'server']) {
    if (ctx.flags.has(flag)) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Browser, page and server selectors do not target account or permission execution hosts.'
      )
    }
  }
  if (process.env.ORCA_CLI_CWD && !ctx.client.isRemote && !getWslAccountTarget(ctx.cwd)) {
    throw new RuntimeClientError(
      'invalid_environment',
      'Run this command on the execution host whose accounts or permissions you want to manage, or select a paired remote host explicitly.'
    )
  }
}
