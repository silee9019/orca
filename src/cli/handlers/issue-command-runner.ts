import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { readAgentSessionRequest } from './agent-session-request'
import { IssueCommandRunnerParams } from '../../shared/rpc-contract/issue-command-runner-params'

export const ISSUE_COMMAND_RUNNER_HANDLERS: Record<string, CommandHandler> = {
  'agent hooks issue-runner': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, IssueCommandRunnerParams)
    const response = await ctx.client.call('hooks.createIssueCommandRunner', params)
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
