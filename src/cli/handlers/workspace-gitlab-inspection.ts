import type { CommandHandler } from '../dispatch'
import { EmptyParams, RepoSelector } from '../../shared/rpc-contract/gitlab-params'
import {
  GitLabIssueLookup,
  GitLabMergeRequestLookup,
  GitLabBranchMergeRequestLookup
} from '../../shared/rpc-contract/workspace-gitlab-inspection-params'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_GITLAB_INSPECTION_HANDLERS: Record<string, CommandHandler> = {
  'gitlab viewer': async (ctx) => {
    await readWorkspaceCommandInput(ctx, EmptyParams)
    printWorkspaceCommandResult(await ctx.client.call('gitlab.viewer'), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'gitlab issue': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitLabIssueLookup)
    printWorkspaceCommandResult(await ctx.client.call('gitlab.issue', params), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'gitlab mr': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitLabMergeRequestLookup)
    printWorkspaceCommandResult(await ctx.client.call('gitlab.mr', params), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'gitlab mr-for-branch': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitLabBranchMergeRequestLookup)
    printWorkspaceCommandResult(
      await ctx.client.call('gitlab.mrForBranch', params),
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  },
  'gitlab project-slug': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoSelector)
    printWorkspaceCommandResult(
      await ctx.client.call('gitlab.projectSlug', params),
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  },
  'gitlab list-assignable-users': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoSelector)
    printWorkspaceCommandResult(
      await ctx.client.call('gitlab.listAssignableUsers', params),
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
