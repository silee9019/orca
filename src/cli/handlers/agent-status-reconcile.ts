import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { readAgentSessionRequest } from './agent-session-request'
import { AgentStatusReconcileParams } from '../../shared/rpc-contract/agent-status-reconcile-params'

export const AGENT_STATUS_RECONCILE_HANDLERS: Record<string, CommandHandler> = {
  'agent status reconcile-ended': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, AgentStatusReconcileParams)
    const response = await ctx.client.call('agentStatus.reconcileEndedProcess', params)
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
