import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { parseConnectionInput } from './connection-input'
import { LocalNetworkConnectionTestParams } from '../../shared/rpc-contract/network-connection-params'
export const NETWORK_CONNECTION_HANDLERS: Record<string, CommandHandler> = {
  'network connection test': async (ctx) => {
    const params = parseConnectionInput(LocalNetworkConnectionTestParams, {
      host: getRequiredStringFlag(ctx.flags, 'address'),
      port: Number(getRequiredStringFlag(ctx.flags, 'port'))
    })
    const response = await ctx.client.call('network.connection.testLocal', params)
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
