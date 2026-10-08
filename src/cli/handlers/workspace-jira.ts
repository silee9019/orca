import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import { JiraProjectAssignableUsers } from '../../shared/rpc-contract/workspace-jira-project-users-params'
import {
  AssignableUsers,
  CreateIssue,
  IssueComment,
  IssueKey,
  IssueUpdate,
  ListIssues,
  ProjectIssueTypeFields,
  ProjectIssueTypes,
  ProjectStatusOrder,
  SearchIssues,
  SiteSelection,
  UserSearch
} from '../../shared/rpc-contract/jira-params'

export const WORKSPACE_JIRA_HANDLERS: Record<string, CommandHandler> = {
  'jira list-project-assignable-users': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, JiraProjectAssignableUsers)
    const result = await ctx.client.call('jira.listAssignableUsersForProject', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira status': async (ctx) => {
    const result = await ctx.client.call('jira.status')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira read-status': async (ctx) => {
    const result = await ctx.client.call('jira.readStatus')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira search-issues': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SearchIssues)
    const result = await ctx.client.call('jira.searchIssues', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira list-issues': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ListIssues)
    const result = await ctx.client.call('jira.listIssues', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira get-issue': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, IssueKey)
    const result = await ctx.client.call('jira.getIssue', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira lookup-issue-summary': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, IssueKey)
    const result = await ctx.client.call('jira.lookupIssueSummary', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira create-issue': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, CreateIssue)
    const result = await ctx.client.call('jira.createIssue', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira update-issue': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, IssueUpdate)
    const result = await ctx.client.call('jira.updateIssue', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira add-issue-comment': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, IssueComment)
    const result = await ctx.client.call('jira.addIssueComment', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira issue-comments': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, IssueKey)
    const result = await ctx.client.call('jira.issueComments', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira list-projects': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SiteSelection)
    const result = await ctx.client.call('jira.listProjects', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira list-issue-types': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectIssueTypes)
    const result = await ctx.client.call('jira.listIssueTypes', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira list-create-fields': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectIssueTypeFields)
    const result = await ctx.client.call('jira.listCreateFields', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira list-priorities': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SiteSelection)
    const result = await ctx.client.call('jira.listPriorities', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira list-assignable-users': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, AssignableUsers)
    const result = await ctx.client.call('jira.listAssignableUsers', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira search-users': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, UserSearch)
    const result = await ctx.client.call('jira.searchUsers', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira list-transitions': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, IssueKey)
    const result = await ctx.client.call('jira.listTransitions', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'jira get-project-status-order': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectStatusOrder)
    const result = await ctx.client.call('jira.getProjectStatusOrder', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
