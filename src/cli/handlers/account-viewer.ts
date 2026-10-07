import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getOptionalStringFlag } from '../flags'
import { printResult } from '../format'
import { AccountsViewerParams } from '../../shared/rpc-contract/accounts-viewer-params'

export const ACCOUNT_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'account-view configure-usage': async (ctx) => {
    requireAccountsPermissionsExecutionHost(ctx)
    const { client, flags, json } = ctx
    const params = AccountsViewerParams.parse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      action: { type: 'configure-usage' }
    })
    printResult(await client.call('accounts.viewerAction', params), json, JSON.stringify)
  },
  'account-view codex-login-link': async (ctx) => {
    requireAccountsPermissionsExecutionHost(ctx)
    const { client, flags, json } = ctx
    const params = AccountsViewerParams.parse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      action: {
        type: 'codex-login-link',
        operation: getRequiredStringFlag(flags, 'operation'),
        confirm: flags.get('confirm') === 'true'
      }
    })
    printResult(await client.call('accounts.viewerAction', params), json, JSON.stringify)
  },
  'account-view open-bitbucket-docs': async (ctx) => {
    requireAccountsPermissionsExecutionHost(ctx)
    const { client, flags, json } = ctx
    const params = AccountsViewerParams.parse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      action: { type: 'open-bitbucket-docs', confirm: flags.get('confirm') === 'true' }
    })
    printResult(await client.call('accounts.viewerAction', params), json, JSON.stringify)
  },
  'account-view open-session-log': async (ctx) => {
    requireAccountsPermissionsExecutionHost(ctx)
    const { client, flags, json } = ctx
    const params = AccountsViewerParams.parse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      action: {
        type: 'open-session-log',
        workspaceId: getRequiredStringFlag(flags, 'workspace'),
        filePath: getRequiredStringFlag(flags, 'file'),
        executionHostId: getRequiredStringFlag(flags, 'execution-host')
      }
    })
    printResult(await client.call('accounts.viewerAction', params), json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'account-view open-settings': async (ctx) => {
    requireAccountsPermissionsExecutionHost(ctx)
    const { client, flags, json } = ctx
    const params = AccountsViewerParams.parse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      action: {
        type: 'open-settings',
        pane: getRequiredStringFlag(flags, 'pane'),
        provider: getOptionalStringFlag(flags, 'provider')
      }
    })
    printResult(await client.call('accounts.viewerAction', params), json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'account-view queue-codex-restarts': async (ctx) => {
    requireAccountsPermissionsExecutionHost(ctx)
    const { client, flags, json } = ctx
    const params = AccountsViewerParams.parse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      action: {
        type: 'queue-codex-restarts',
        ptyIds: getRequiredStringFlag(flags, 'pty-ids').split(','),
        confirm: flags.get('confirm') === 'true'
      }
    })
    printResult(await client.call('accounts.viewerAction', params), json, (value) =>
      JSON.stringify(value, null, 2)
    )
  }
}
