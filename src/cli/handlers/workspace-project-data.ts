import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import { ProjectUpdate } from '../../shared/rpc-contract/project-runtime-params'

export const WORKSPACE_PROJECT_DATA_HANDLERS: Record<string, CommandHandler> = {
  'project update': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, ProjectUpdate)
    const result = await ctx.client.call('project.update', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
