import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import {
  RepoFolderPickerStart,
  RepoFolderPickerRequest,
  RepoFolderPickerResult
} from '../../shared/rpc-contract/workspace-repo-folder-picker-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_REPO_FOLDER_PICKER_HANDLERS: Record<string, CommandHandler> = {
  'repo folder-picker-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoFolderPickerStart)
    confirmWorkspaceCommand(ctx, 'repo-folder-picker')
    const response = await ctx.client.call('repoFolderPicker.start', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'repo folder-picker-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoFolderPickerRequest)
    const response = await ctx.client.call('repoFolderPicker.status', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'repo folder-picker-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoFolderPickerRequest)
    const response = await ctx.client.call('repoFolderPicker.cancel', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'repo folder-picker-result': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoFolderPickerRequest)
    const response = await ctx.client.call('repoFolderPicker.result', params)
    const result = RepoFolderPickerResult.safeParse(response.result)
    if (!result.success) {
      throw new RuntimeClientError(
        'operation_failed',
        'The selected desktop returned an invalid folder selection.'
      )
    }
    printWorkspaceCommandResult({ ...response, result: result.data }, ctx.json, (value) =>
      JSON.stringify(value)
    )
  }
}
