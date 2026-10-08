import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import {
  CreateIssue,
  Issue,
  IssueComment,
  UpdateIssue
} from '../../shared/rpc-contract/github-issue-params'

export const WORKSPACE_GITHUB_ISSUE_HANDLERS: Record<string, CommandHandler> = {
  'github issue': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, Issue)
    const result = await ctx.client.call('github.issue', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github create-issue': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, CreateIssue)
    const result = await ctx.client.call('github.createIssue', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github update-issue': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, UpdateIssue)
    const result = await ctx.client.call('github.updateIssue', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github add-issue-comment': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, IssueComment)
    const result = await ctx.client.call('github.addIssueComment', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
