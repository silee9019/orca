import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import {
  ClearProjectItemField,
  GithubProjectListAccessibleParams,
  ProjectItemField,
  ProjectRef,
  ProjectViewTable,
  ProjectViews,
  ProjectWorkItemDetailsBySlug,
  SlugAssignableUsers,
  SlugIssueComment,
  SlugIssueCommentDelete,
  SlugIssueCommentEdit,
  SlugIssueTypeUpdate,
  SlugIssueUpdate,
  SlugPullRequestUpdate
} from '../../shared/rpc-contract/github-project-params'
import { SlugRepo } from '../../shared/rpc-contract/github-repo-target-params'

export const WORKSPACE_GITHUB_PROJECT_HANDLERS: Record<string, CommandHandler> = {
  'github project list-accessible': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GithubProjectListAccessibleParams)
    const result = await ctx.client.call('github.project.listAccessible', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project list-labels-by-slug': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SlugRepo)
    const result = await ctx.client.call('github.project.listLabelsBySlug', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project list-assignable-users-by-slug': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SlugAssignableUsers)
    const result = await ctx.client.call('github.project.listAssignableUsersBySlug', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project list-issue-types-by-slug': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SlugRepo)
    const result = await ctx.client.call('github.project.listIssueTypesBySlug', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project resolve-ref': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectRef)
    const result = await ctx.client.call('github.project.resolveRef', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project list-views': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectViews)
    const result = await ctx.client.call('github.project.listViews', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project view-table': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectViewTable)
    const result = await ctx.client.call('github.project.viewTable', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project work-item-details-by-slug': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectWorkItemDetailsBySlug)
    const result = await ctx.client.call('github.project.workItemDetailsBySlug', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project update-item-field': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectItemField)
    const result = await ctx.client.call('github.project.updateItemField', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project clear-item-field': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ClearProjectItemField)
    const result = await ctx.client.call('github.project.clearItemField', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project update-issue-by-slug': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SlugIssueUpdate)
    const result = await ctx.client.call('github.project.updateIssueBySlug', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project update-pull-request-by-slug': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SlugPullRequestUpdate)
    const result = await ctx.client.call('github.project.updatePullRequestBySlug', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project update-issue-type-by-slug': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SlugIssueTypeUpdate)
    const result = await ctx.client.call('github.project.updateIssueTypeBySlug', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project add-issue-comment-by-slug': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SlugIssueComment)
    const result = await ctx.client.call('github.project.addIssueCommentBySlug', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project update-issue-comment-by-slug': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SlugIssueCommentEdit)
    const result = await ctx.client.call('github.project.updateIssueCommentBySlug', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github project delete-issue-comment-by-slug': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SlugIssueCommentDelete)
    confirmWorkspaceCommand(ctx, `${params.owner}/${params.repo}:${params.commentId}`)
    const result = await ctx.client.call('github.project.deleteIssueCommentBySlug', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
