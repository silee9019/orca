import type { CommandHandler, HandlerContext } from '../dispatch'
import { getRequiredStringFlag, getOptionalStringFlag } from '../flags'
import { printResult } from '../format'
import { parseConnectionInput } from './connection-input'
import {
  MobileNetworkHumanComplete,
  MobileNetworkHumanStart
} from '../../shared/rpc-contract/mobile-connection-params'
async function request(ctx: HandlerContext, method: string): Promise<void> {
  const response = await ctx.client.call(method, {
    requestId: getRequiredStringFlag(ctx.flags, 'request')
  })
  printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
}
export const MOBILE_NETWORK_HUMAN_HANDLERS: Record<string, CommandHandler> = {
  'mobile network-action complete': async (ctx) => {
    const response = await ctx.client.call(
      'mobile.networkAction.complete',
      parseConnectionInput(MobileNetworkHumanComplete, {
        requestId: getRequiredStringFlag(ctx.flags, 'request'),
        confirmTarget: getRequiredStringFlag(ctx.flags, 'confirm-target')
      })
    )
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'mobile network-action start': async (ctx) => {
    const response = await ctx.client.call(
      'mobile.networkAction.start',
      parseConnectionInput(MobileNetworkHumanStart, {
        action: getRequiredStringFlag(ctx.flags, 'action'),
        address: getOptionalStringFlag(ctx.flags, 'address')
      })
    )
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'mobile network-action status': (ctx) => request(ctx, 'mobile.networkAction.status'),
  'mobile network-action cancel': (ctx) => request(ctx, 'mobile.networkAction.cancel'),
  'mobile network-action verify': (ctx) => request(ctx, 'mobile.networkAction.verify')
}
