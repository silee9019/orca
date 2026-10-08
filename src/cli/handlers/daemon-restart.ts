import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import {
  DaemonRestartParams,
  DaemonRestartPlan,
  DaemonRestartReceipt
} from '../../shared/rpc-contract/daemon-restart-params'
import { readAgentSessionRequest } from './agent-session-request'
import { printResult } from '../format'

export const DAEMON_RESTART_HANDLERS: Record<string, CommandHandler> = {
  'terminal daemon restart-plan': async (ctx) => {
    const response = await ctx.client.call('daemon.restartPlan', {})
    const plan = DaemonRestartPlan.safeParse(response.result)
    if (!plan.success || plan.data.runtimeId !== response._meta.runtimeId) {
      throw new RuntimeClientError(
        'invalid_runtime_response',
        'The host returned an invalid restart plan.'
      )
    }
    printResult({ ...response, result: plan.data }, ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'terminal daemon restart': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, DaemonRestartParams)
    const response = await ctx.client.call('daemon.restartPinned', params)
    const receipt = DaemonRestartReceipt.safeParse(response.result)
    if (!receipt.success) {
      throw new RuntimeClientError(
        'invalid_runtime_response',
        'The host returned an invalid restart receipt.'
      )
    }
    const result = receipt.data
    if (
      response._meta.runtimeId !== params.runtimeId ||
      Object.entries(params).some(
        ([key, expected]) => Reflect.get(result.requested, key) !== expected
      ) ||
      result.replacement.runtimeId !== params.runtimeId ||
      result.replacement.protocolVersion !== params.protocolVersion
    ) {
      throw new RuntimeClientError(
        'invalid_runtime_response',
        'The host returned an invalid restart receipt.'
      )
    }
    if (
      !result.restarted ||
      result.replacement.daemonIdentityDigest === params.daemonIdentityDigest
    ) {
      throw new RuntimeClientError(
        'daemon_restart_unconfirmed',
        'The selected host did not observe a replacement daemon.',
        result
      )
    }
    printResult({ ...response, result }, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
