import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import {
  JiraCliSearchStart,
  JiraCliSummaryStart,
  JiraCliReadRequest
} from '../../shared/rpc-contract/workspace-jira-read-params'

export const WORKSPACE_JIRA_READ_HANDLERS: Record<string, CommandHandler> = {
  'jira search-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, JiraCliSearchStart)
    printWorkspaceCommandResult(
      await ctx.client.call('jira.cliSearchStart', params),
      ctx.json,
      JSON.stringify
    )
  },
  'jira summary-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, JiraCliSummaryStart)
    printWorkspaceCommandResult(
      await ctx.client.call('jira.cliSummaryStart', params),
      ctx.json,
      JSON.stringify
    )
  },
  'jira search-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, JiraCliReadRequest)
    printWorkspaceCommandResult(
      await ctx.client.call('jira.cliSearchStatus', params),
      ctx.json,
      JSON.stringify
    )
  },
  'jira summary-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, JiraCliReadRequest)
    printWorkspaceCommandResult(
      await ctx.client.call('jira.cliSummaryStatus', params),
      ctx.json,
      JSON.stringify
    )
  },
  'jira search-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, JiraCliReadRequest)
    printWorkspaceCommandResult(
      await ctx.client.call('jira.cliSearchCancel', params),
      ctx.json,
      JSON.stringify
    )
  },
  'jira summary-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, JiraCliReadRequest)
    printWorkspaceCommandResult(
      await ctx.client.call('jira.cliSummaryCancel', params),
      ctx.json,
      JSON.stringify
    )
  }
}
