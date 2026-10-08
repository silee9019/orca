import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import {
  GitBranchCompare,
  GitBranchDiff,
  GitBulkPaths,
  GitCheckIgnored,
  GitCheckout,
  GitCommit,
  GitCommitCompare,
  GitCommitDiff,
  GitDiff,
  GitForkSync,
  GitHistory,
  GitPush,
  GitRebaseFromBase,
  GitRemoteCommitUrl,
  GitRemoteFileUrl,
  GitStatusParams,
  GitSubmoduleStatus,
  GitTargetedRemote,
  WorktreeSelector
} from '../../shared/rpc-contract/git-params'

export const WORKSPACE_GIT_HANDLERS: Record<string, CommandHandler> = {
  'git status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitStatusParams)
    const result = await ctx.client.call('git.status', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git history': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitHistory)
    const result = await ctx.client.call('git.history', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git diff': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitDiff)
    const result = await ctx.client.call('git.diff', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git branch-compare': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitBranchCompare)
    const result = await ctx.client.call('git.branchCompare', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git commit-compare': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitCommitCompare)
    const result = await ctx.client.call('git.commitCompare', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git branch-diff': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitBranchDiff)
    const result = await ctx.client.call('git.branchDiff', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git commit-diff': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitCommitDiff)
    const result = await ctx.client.call('git.commitDiff', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git check-ignored': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitCheckIgnored)
    const result = await ctx.client.call('git.checkIgnored', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git submodule-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitSubmoduleStatus)
    const result = await ctx.client.call('git.submoduleStatus', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git conflict-operation': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreeSelector)
    const result = await ctx.client.call('git.conflictOperation', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git abort-merge': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreeSelector)
    confirmWorkspaceCommand(ctx, params.worktree)
    const result = await ctx.client.call('git.abortMerge', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git abort-rebase': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreeSelector)
    confirmWorkspaceCommand(ctx, params.worktree)
    const result = await ctx.client.call('git.abortRebase', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git checkout': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitCheckout)
    const result = await ctx.client.call('git.checkout', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git branches': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreeSelector)
    const result = await ctx.client.call('git.localBranches', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git upstream-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitTargetedRemote)
    const result = await ctx.client.call('git.upstreamStatus', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git fetch': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitTargetedRemote)
    const result = await ctx.client.call('git.fetch', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git pull': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitTargetedRemote)
    const result = await ctx.client.call('git.pull', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git fast-forward': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitTargetedRemote)
    const result = await ctx.client.call('git.fastForward', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git rebase': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitRebaseFromBase)
    const result = await ctx.client.call('git.rebaseFromBase', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git sync-fork': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitForkSync)
    const result = await ctx.client.call('git.forkSync', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git push': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitPush)
    confirmWorkspaceCommand(ctx, params.worktree)
    const result = await ctx.client.call('git.push', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git commit': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitCommit)
    const result = await ctx.client.call('git.commit', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git stage': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitBulkPaths)
    const result = await ctx.client.call('git.bulkStage', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git unstage': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitBulkPaths)
    const result = await ctx.client.call('git.bulkUnstage', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git discard': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitBulkPaths)
    confirmWorkspaceCommand(ctx, params.worktree)
    const result = await ctx.client.call('git.bulkDiscard', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git remote-file-url': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitRemoteFileUrl)
    const result = await ctx.client.call('git.remoteFileUrl', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git remote-commit-url': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitRemoteCommitUrl)
    const result = await ctx.client.call('git.remoteCommitUrl', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
