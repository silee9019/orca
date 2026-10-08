import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import {
  AddIssueComment,
  AddMRComment,
  AddMRInlineComment,
  CreateIssue,
  EmptyParams,
  GitLabRateLimit,
  IssuesList,
  JobTrace,
  MergeMr,
  RepoSelector,
  ResolveMRDiscussion,
  RetryJob,
  UpdateIssue,
  UpdateMr,
  UpdateMrReviewers,
  UpdateMrState,
  WorkItemByPath,
  WorkItemDetails,
  WorkItemsList
} from '../../shared/rpc-contract/gitlab-params'

export const WORKSPACE_GITLAB_HANDLERS: Record<string, CommandHandler> = {
  'gitlab list-mrs': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkItemsList)
    const result = await ctx.client.call('gitlab.listMRs', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab list-work-items': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkItemsList)
    const result = await ctx.client.call('gitlab.listWorkItems', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab list-issues': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, IssuesList)
    const result = await ctx.client.call('gitlab.listIssues', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab todos': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoSelector)
    const result = await ctx.client.call('gitlab.todos', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab diagnose-auth': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, EmptyParams)
    const result = await ctx.client.call('gitlab.diagnoseAuth', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab rate-limit': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitLabRateLimit)
    const result = await ctx.client.call('gitlab.rateLimit', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab list-labels': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoSelector)
    const result = await ctx.client.call('gitlab.listLabels', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab create-issue': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, CreateIssue)
    const result = await ctx.client.call('gitlab.createIssue', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab update-issue': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, UpdateIssue)
    const result = await ctx.client.call('gitlab.updateIssue', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab add-issue-comment': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, AddIssueComment)
    const result = await ctx.client.call('gitlab.addIssueComment', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab add-mr-comment': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, AddMRComment)
    const result = await ctx.client.call('gitlab.addMRComment', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab add-mr-inline-comment': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, AddMRInlineComment)
    const result = await ctx.client.call('gitlab.addMRInlineComment', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab resolve-mr-discussion': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ResolveMRDiscussion)
    const result = await ctx.client.call('gitlab.resolveMRDiscussion', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab job-trace': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, JobTrace)
    const result = await ctx.client.call('gitlab.jobTrace', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab retry-job': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RetryJob)
    confirmWorkspaceCommand(ctx, `${params.repo}:${params.jobId}`)
    const result = await ctx.client.call('gitlab.retryJob', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab merge-mr': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, MergeMr)
    confirmWorkspaceCommand(ctx, `${params.repo}:${params.iid}`)
    const result = await ctx.client.call('gitlab.mergeMR', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab update-mr-state': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, UpdateMrState)
    const result = await ctx.client.call('gitlab.updateMRState', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab update-mr': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, UpdateMr)
    const result = await ctx.client.call('gitlab.updateMR', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab update-mr-reviewers': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, UpdateMrReviewers)
    const result = await ctx.client.call('gitlab.updateMRReviewers', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab work-item-details': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkItemDetails)
    const result = await ctx.client.call('gitlab.workItemDetails', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'gitlab work-item-by-path': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkItemByPath)
    const result = await ctx.client.call('gitlab.workItemByPath', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
