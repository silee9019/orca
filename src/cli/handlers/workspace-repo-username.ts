import type { CommandHandler } from '../dispatch'
import { RepoHostGitUsername } from '../../shared/rpc-contract/workspace-repo-username-params'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_REPO_USERNAME_HANDLERS: Record<string, CommandHandler> = {
  'repo git-username-for-host': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RepoHostGitUsername)
    const response = await ctx.client.call('repo.gitUsernameForHost', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
