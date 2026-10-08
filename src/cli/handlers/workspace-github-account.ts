import type { CommandHandler } from '../dispatch'
import { EmptyParams } from '../../shared/rpc-contract/gitlab-params'
import {
  GitHubAccountDiagnostic,
  GitHubStarRequest
} from '../../shared/rpc-contract/workspace-github-account-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_GITHUB_ACCOUNT_HANDLERS: Record<string, CommandHandler> = {
  'github viewer': async (ctx) => {
    await readWorkspaceCommandInput(ctx, EmptyParams)
    printWorkspaceCommandResult(await ctx.client.call('github.viewer'), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'github diagnose-auth': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitHubAccountDiagnostic)
    printWorkspaceCommandResult(
      await ctx.client.call('github.diagnoseAuth', params),
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  },
  'github check-orca-starred': async (ctx) => {
    await readWorkspaceCommandInput(ctx, EmptyParams)
    printWorkspaceCommandResult(
      await ctx.client.call('github.checkOrcaStarred'),
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  },
  'github star-orca': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitHubStarRequest)
    confirmWorkspaceCommand(ctx, 'stablyai/orca')
    printWorkspaceCommandResult(
      await ctx.client.call('github.starOrca', params),
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
