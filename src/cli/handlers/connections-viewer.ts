import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getRequiredStringFlag } from '../flags'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import { ConnectionsViewerParams } from '../../shared/rpc-contract/connections-viewer-params'
import { parseConnectionInput, readConnectionJson } from './connection-input'
export const CONNECTIONS_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'connections viewer': async (ctx) => {
    rejectRemoteSelectionFlags(ctx.flags, 'viewer-local connection controls.')
    const command = await readConnectionJson(ctx.flags)
    const viewerId = Number(getRequiredStringFlag(ctx.flags, 'viewer'))
    const params = parseConnectionInput(
      ConnectionsViewerParams,
      typeof command === 'object' && command !== null ? { ...command, viewerId } : command
    )
    const result = await ctx.client.call('connections.viewer.apply', params)
    printResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
