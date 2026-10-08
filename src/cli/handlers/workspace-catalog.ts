import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import {
  WorktreeDetectedListParams,
  WorktreeSortOrder,
  WorktreeResolvePrBase,
  WorktreeResolveMrBase,
  WorktreeForceDeleteBranch
} from '../../shared/rpc-contract/worktree-params'
import { WorktreePrefetchCreateBase } from '../../shared/rpc-contract/worktree-create-params'

export const WORKSPACE_CATALOG_HANDLERS: Record<string, CommandHandler> = {
  'worktree detected': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreeDetectedListParams)
    const result = await ctx.client.call('worktree.detectedList', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'worktree retired-names': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreeDetectedListParams)
    const result = await ctx.client.call('worktree.listRetiredNames', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'worktree lineage': async (ctx) => {
    const result = await ctx.client.call('worktree.lineageList')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'worktree reorder': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreeSortOrder)
    const result = await ctx.client.call('worktree.persistSortOrder', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'worktree resolve-pr-base': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreeResolvePrBase)
    const result = await ctx.client.call('worktree.resolvePrBase', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'worktree resolve-mr-base': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreeResolveMrBase)
    const result = await ctx.client.call('worktree.resolveMrBase', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'worktree prefetch-base': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreePrefetchCreateBase)
    const result = await ctx.client.call('worktree.prefetchCreateBase', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'worktree delete-preserved-branch': async (ctx) => {
    const params = await readWorkspaceCommandInput(
      ctx,
      WorktreeForceDeleteBranch.required({ hostId: true })
    )
    confirmWorkspaceCommand(
      ctx,
      `${params.worktree}:${params.hostId}:${params.branchName}:${params.expectedHead}`
    )
    const result = await ctx.client.call('worktree.forceDeleteBranch', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
