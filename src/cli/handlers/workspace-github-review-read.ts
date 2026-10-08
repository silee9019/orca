import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import {
  PRCommentReaction,
  PrForBranch,
  PullRequest,
  PullRequestCheckDetails,
  PullRequestChecks,
  PullRequestFileContents,
  PullRequestFileViewed,
  RerunPullRequestChecks,
  ReviewThread
} from '../../shared/rpc-contract/github-pull-request-params'

export const WORKSPACE_GITHUB_REVIEW_READ_HANDLERS: Record<string, CommandHandler> = {
  'github pr-for-branch': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, PrForBranch)
    const result = await ctx.client.call('github.prForBranch', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github pr-checks': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, PullRequestChecks)
    const result = await ctx.client.call('github.prChecks', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github pr-check-details': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, PullRequestCheckDetails)
    const result = await ctx.client.call('github.prCheckDetails', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github rerun-pr-checks': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RerunPullRequestChecks)
    const result = await ctx.client.call('github.rerunPRChecks', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github pr-comments': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, PullRequest)
    const result = await ctx.client.call('github.prComments', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github set-pr-comment-reaction': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, PRCommentReaction)
    const result = await ctx.client.call('github.setPRCommentReaction', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github pr-file-contents': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, PullRequestFileContents)
    const result = await ctx.client.call('github.prFileContents', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github resolve-review-thread': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ReviewThread)
    const result = await ctx.client.call('github.resolveReviewThread', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github set-pr-file-viewed': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, PullRequestFileViewed)
    const result = await ctx.client.call('github.setPRFileViewed', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
