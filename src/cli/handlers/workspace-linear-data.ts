import { CreateProject } from '../../shared/rpc-contract/linear-project-create-params'
import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import {
  ConcreteWorkspaceId,
  CustomViewContents,
  CustomViewId,
  LinearIssueCommentsParams,
  ListCustomViews,
  ProjectId,
  ProjectIssues
} from '../../shared/rpc-contract/linear-params'

export const WORKSPACE_LINEAR_DATA_HANDLERS: Record<string, CommandHandler> = {
  'linear project create': async (ctx) => {
    const params = await readWorkspaceCommandInput(
      ctx,
      CreateProject.extend({ workspaceId: ConcreteWorkspaceId })
    )
    confirmWorkspaceCommand(ctx, `${params.workspaceId}:${params.name}`)
    const result = await ctx.client.call('linear.createProject', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear issue-comments': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, LinearIssueCommentsParams)
    const result = await ctx.client.call('linear.issueComments', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear project get': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectId)
    const result = await ctx.client.call('linear.getProject', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear list-project-issues': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectIssues)
    const result = await ctx.client.call('linear.listProjectIssues', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear list-custom-views': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ListCustomViews)
    const result = await ctx.client.call('linear.listCustomViews', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear get-custom-view': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, CustomViewId)
    const result = await ctx.client.call('linear.getCustomView', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear list-custom-view-issues': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, CustomViewContents)
    const result = await ctx.client.call('linear.listCustomViewIssues', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear list-custom-view-projects': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, CustomViewContents)
    const result = await ctx.client.call('linear.listCustomViewProjects', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
