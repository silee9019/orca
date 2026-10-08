import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import {
  BindableAccounts,
  ValidateAccountBinding
} from '../../shared/rpc-contract/github-account-binding-params'
import { RepoSelector } from '../../shared/rpc-contract/github-repo-target-params'
import {
  IssuesList,
  RateLimit,
  WorkItem,
  WorkItemByOwnerRepo,
  WorkItemDetails,
  WorkItemsCount,
  WorkItemsList
} from '../../shared/rpc-contract/github-repo-work-item-params'

export const WORKSPACE_GITHUB_WORK_ITEMS_HANDLERS: Record<string, CommandHandler> = {
  'github validate-account-binding': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ValidateAccountBinding)
    const result = await ctx.client.call('github.validateAccountBinding', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github list-bindable-accounts': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, BindableAccounts)
    const result = await ctx.client.call('github.listBindableAccounts', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github repo-slug': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoSelector)
    const result = await ctx.client.call('github.repoSlug', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github repo-upstream': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoSelector)
    const result = await ctx.client.call('github.repoUpstream', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github rate-limit': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RateLimit)
    const result = await ctx.client.call('github.rateLimit', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github list-work-items': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkItemsList)
    const result = await ctx.client.call('github.listWorkItems', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github list-issues': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, IssuesList)
    const result = await ctx.client.call('github.listIssues', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github count-work-items': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkItemsCount)
    const result = await ctx.client.call('github.countWorkItems', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github list-labels': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoSelector)
    const result = await ctx.client.call('github.listLabels', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github list-assignable-users': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoSelector)
    const result = await ctx.client.call('github.listAssignableUsers', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github work-item': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkItem)
    const result = await ctx.client.call('github.workItem', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github work-item-by-owner-repo': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkItemByOwnerRepo)
    const result = await ctx.client.call('github.workItemByOwnerRepo', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'github work-item-details': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkItemDetails)
    const result = await ctx.client.call('github.workItemDetails', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
