import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import {
  ProjectGroupCreate,
  ProjectGroupImportNested,
  ProjectGroupMoveProject,
  ProjectGroupScanNested,
  ProjectGroupSelector,
  ProjectGroupUpdate
} from '../../shared/rpc-contract/repo-params'

export const WORKSPACE_PROJECT_GROUP_HANDLERS: Record<string, CommandHandler> = {
  'project-group list': async (ctx) => {
    const result = await ctx.client.call('projectGroup.list')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'project-group create': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectGroupCreate)
    const result = await ctx.client.call('projectGroup.create', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'project-group update': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectGroupUpdate)
    const result = await ctx.client.call('projectGroup.update', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'project-group delete': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectGroupSelector)
    confirmWorkspaceCommand(ctx, params.groupId)
    const result = await ctx.client.call('projectGroup.delete', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'project-group move-project': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectGroupMoveProject)
    const result = await ctx.client.call('projectGroup.moveProject', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'project-group scan-nested': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectGroupScanNested)
    const result = await ctx.client.call('projectGroup.scanNested', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'project-group import-nested': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectGroupImportNested)
    const result = await ctx.client.call('projectGroup.importNested', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
