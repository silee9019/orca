import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import {
  HostedReviewForBranch,
  HostedReviewCreationEligibility,
  HostedReviewCreate
} from '../../shared/rpc-contract/hosted-review-params'

export const WORKSPACE_HOSTED_REVIEW_HANDLERS: Record<string, CommandHandler> = {
  'review for-branch': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, HostedReviewForBranch)
    const result = await ctx.client.call('hostedReview.forBranch', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'review eligibility': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, HostedReviewCreationEligibility)
    const result = await ctx.client.call('hostedReview.getCreationEligibility', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'review create': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, HostedReviewCreate)
    confirmWorkspaceCommand(
      ctx,
      `${params.repo}:${params.provider}:${params.head ?? 'current'}:${params.base}`
    )
    const result = await ctx.client.call('hostedReview.create', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'review create-stacked': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, HostedReviewCreate)
    confirmWorkspaceCommand(
      ctx,
      `${params.repo}:${params.provider}:${params.head ?? 'current'}:${params.base}`
    )
    const result = await ctx.client.call('hostedReview.createStacked', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
