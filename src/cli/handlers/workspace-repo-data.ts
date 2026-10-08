import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import {
  RepoHostRemoval,
  RepoHostReorder
} from '../../shared/rpc-contract/workspace-repo-host-params'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { RepoSelector } from '../../shared/rpc-contract/github-repo-target-params'
import {
  RepoClone,
  RepoCreate,
  RepoReorder,
  RepoSparsePresetSave
} from '../../shared/rpc-contract/repo-params'

export const WORKSPACE_REPO_DATA_HANDLERS: Record<string, CommandHandler> = {
  'repo default-project-parent': async (ctx) => {
    const result = await ctx.client.call('repo.defaultProjectParent')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'repo remove-for-host': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoHostRemoval)
    confirmWorkspaceCommand(ctx, `${params.hostId}:${params.repoId}`)
    const result = await ctx.client.call('repo.removeForHost', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'repo reorder-for-host': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoHostReorder)
    const result = await ctx.client.call('repo.reorderForHost', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'repo sparse-presets': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoSelector)
    const result = await ctx.client.call('repo.sparsePresets', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'repo save-sparse-preset': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoSparsePresetSave)
    const result = await ctx.client.call('repo.saveSparsePreset', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'repo create': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoCreate)
    const result = await ctx.client.call('repo.create', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'repo git-available': async (ctx) => {
    const result = await ctx.client.call('repo.gitAvailable')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'repo clone': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoClone)
    const result = await ctx.client.call('repo.clone', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'repo rm': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoSelector)
    confirmWorkspaceCommand(ctx, params.repo)
    const result = await ctx.client.call('repo.rm', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'repo reorder': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoReorder)
    const result = await ctx.client.call<{ status: 'applied' | 'rejected' }>('repo.reorder', params)
    if (result.result.status !== 'applied') {
      throw new RuntimeClientError(
        'operation_failed',
        'The selected host rejected the repository order.'
      )
    }
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'repo base-ref-default': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoSelector)
    const result = await ctx.client.call('repo.baseRefDefault', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
