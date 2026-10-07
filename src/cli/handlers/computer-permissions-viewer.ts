import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import {
  ComputerPermissionsViewerCommand,
  ComputerPermissionsViewerState
} from '../../shared/rpc-contract/computer-permissions-viewer-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const COMPUTER_PERMISSIONS_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'computer permissions viewer': async (ctx) => {
    const action = getRequiredStringFlag(ctx.flags, 'action')
    const command = ComputerPermissionsViewerCommand.safeParse({
      action,
      ...(action === 'reset' ? { confirm: getRequiredStringFlag(ctx.flags, 'confirm') } : {})
    })
    if (!command.success || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify --viewer host and a valid permissions viewer action.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer: 'host',
      operation: 'computer-permissions',
      command: command.data
    })
    if (!result.result.applied || !result.result.computerPermissions) {
      throw new RuntimeClientError(
        'runtime_error',
        'Computer Use permission pane did not acknowledge the action.'
      )
    }
    const state = ComputerPermissionsViewerState.safeParse(result.result.computerPermissions)
    if (!state.success) {
      throw new RuntimeClientError('runtime_error', 'Invalid Computer Use permission pane reply.')
    }
    printResult(
      { ...result, result: { ...result.result, computerPermissions: state.data } },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
