import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import {
  MarkPrReadyForReview,
  MergePr,
  PRReviewComment,
  PRReviewCommentReply,
  RemovePrReviewers,
  RequestPrReviewers,
  SetPrAutoMerge,
  UpdatePr,
  UpdatePrState,
  UpdatePrTitle
} from '../../shared/rpc-contract/github-pull-request-update-params'

export const WORKSPACE_GITHUB_REVIEW_HANDLERS: Record<string, CommandHandler> = {
  'github update-pr-title': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, UpdatePrTitle)
    const result = await ctx.client.call('github.updatePRTitle', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github update-pr': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, UpdatePr)
    const result = await ctx.client.call('github.updatePR', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github merge-pr': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, MergePr)
    confirmWorkspaceCommand(ctx, `${params.repo}:${params.prNumber}`)
    const result = await ctx.client.call('github.mergePR', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github set-pr-auto-merge': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SetPrAutoMerge)
    confirmWorkspaceCommand(ctx, `${params.repo}:${params.prNumber}`)
    const result = await ctx.client.call('github.setPRAutoMerge', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github update-pr-state': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, UpdatePrState)
    const result = await ctx.client.call('github.updatePRState', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github mark-pr-ready-for-review': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, MarkPrReadyForReview)
    const result = await ctx.client.call('github.markPRReadyForReview', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github request-pr-reviewers': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RequestPrReviewers)
    const result = await ctx.client.call('github.requestPRReviewers', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github remove-pr-reviewers': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RemovePrReviewers)
    const result = await ctx.client.call('github.removePRReviewers', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github add-pr-review-comment': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, PRReviewComment)
    const result = await ctx.client.call('github.addPRReviewComment', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github add-pr-review-comment-reply': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, PRReviewCommentReply)
    const result = await ctx.client.call('github.addPRReviewCommentReply', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
