import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import {
  GitGenerateCommitMessage,
  GitDiscoverCommitMessageModels,
  GitGeneratePullRequestFields,
  WorktreeSelector
} from '../../shared/rpc-contract/git-params'

export const WORKSPACE_GIT_GENERATION_HANDLERS: Record<string, CommandHandler> = {
  'git generate-commit-message': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitGenerateCommitMessage)
    const result = await ctx.client.call('git.generateCommitMessage', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git discover-commit-models': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitDiscoverCommitMessageModels)
    const result = await ctx.client.call('git.discoverCommitMessageModels', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git cancel-commit-message': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreeSelector)
    confirmWorkspaceCommand(ctx, params.worktree)
    const result = await ctx.client.call('git.cancelGenerateCommitMessage', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git generate-review-fields': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitGeneratePullRequestFields)
    const result = await ctx.client.call('git.generatePullRequestFields', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git cancel-review-fields': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreeSelector)
    confirmWorkspaceCommand(ctx, params.worktree)
    const result = await ctx.client.call('git.cancelGeneratePullRequestFields', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
