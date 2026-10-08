import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { readAgentSessionRequest } from './agent-session-request'
import {
  AgentPaneRetireParams,
  AgentPaneRestoreParams
} from '../../shared/rpc-contract/agent-pane-authority-params'

export const AGENT_PANE_AUTHORITY_HANDLERS: Record<string, CommandHandler> = {
  'agent status retire-pane': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, AgentPaneRetireParams)
    printResult(
      await ctx.client.call('agentStatus.retirePaneAuthority', params),
      ctx.json,
      (value) => JSON.stringify(value)
    )
  },
  'agent status restore-pane': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, AgentPaneRestoreParams)
    printResult(
      await ctx.client.call('agentStatus.restorePaneAuthority', params),
      ctx.json,
      (value) => JSON.stringify(value)
    )
  }
}
