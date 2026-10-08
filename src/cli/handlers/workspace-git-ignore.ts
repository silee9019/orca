import type { CommandHandler } from '../dispatch'
import { WorktreeSelector } from '../../shared/rpc-contract/git-params'
import { GitAppendGitignore } from '../../shared/rpc-contract/git-ignore-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_GIT_IGNORE_HANDLERS: Record<string, CommandHandler> = {
  'git ignore-candidates': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorktreeSelector)
    const result = await ctx.client.call('git.findHugeFoldersToIgnore', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'git ignore-folder': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, GitAppendGitignore)
    confirmWorkspaceCommand(ctx, `${params.worktree}:${params.folderName}`)
    const result = await ctx.client.call('git.appendGitignore', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
