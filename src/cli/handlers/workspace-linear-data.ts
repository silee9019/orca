import { CreateProject } from '../../shared/rpc-contract/linear-project-create-params'
import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { LegacyListIssues } from '../../shared/rpc-contract/linear-issue-list-params'
import {
  ConcreteWorkspaceId,
  CreateIssue,
  IssueId,
  ConcreteIssueUpdate,
  IssueComment,
  SearchIssues,
  ListProjects,
  WorkspaceSelection,
  TeamId,
  CustomViewContents,
  CustomViewId,
  LinearIssueCommentsParams,
  ListCustomViews,
  ProjectId,
  ProjectIssues
} from '../../shared/rpc-contract/linear-params'

export const WORKSPACE_LINEAR_DATA_HANDLERS: Record<string, CommandHandler> = {
  'linear create-issue': async (ctx) => {
    const params = await readWorkspaceCommandInput(
      ctx,
      CreateIssue.extend({ workspaceId: ConcreteWorkspaceId })
    )
    confirmWorkspaceCommand(ctx, `${params.workspaceId}:${params.teamId}`)
    const result = await ctx.client.call('linear.createIssue', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear update-issue': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ConcreteIssueUpdate)
    confirmWorkspaceCommand(ctx, `${params.workspaceId}:${params.id}`)
    const result = await ctx.client.call('linear.updateIssueFields', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear add-issue-comment': async (ctx) => {
    const params = await readWorkspaceCommandInput(
      ctx,
      IssueComment.extend({ workspaceId: ConcreteWorkspaceId })
    )
    confirmWorkspaceCommand(ctx, `${params.workspaceId}:${params.issueId}`)
    const result = await ctx.client.call('linear.addIssueComment', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear get-issue': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, IssueId)
    const result = await ctx.client.call('linear.getIssue', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear list-workspace-issues': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, LegacyListIssues)
    const result = await ctx.client.call('linear.listIssues', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear search-issues': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SearchIssues)
    const result = await ctx.client.call('linear.searchIssues', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear list-projects': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ListProjects)
    const result = await ctx.client.call('linear.listProjects', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear list-teams': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkspaceSelection)
    const result = await ctx.client.call('linear.listTeams', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear team-states': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, TeamId)
    const result = await ctx.client.call('linear.teamStates', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear team-labels': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, TeamId)
    const result = await ctx.client.call('linear.teamLabels', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear team-members': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, TeamId)
    const result = await ctx.client.call('linear.teamMembers', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
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
