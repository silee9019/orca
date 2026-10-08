import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import { BranchRenameFailureRead } from '../../shared/rpc-contract/workspace-branch-rename-failure-params'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { resolveClientOutputPath, writeNewClientOutputFile } from '../workspace-client-output-file'
export const WORKSPACE_BRANCH_RENAME_FAILURE_HANDLERS: Record<string, CommandHandler> = {
  'worktree branch-rename-failure': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, BranchRenameFailureRead)
    const outputPath = resolveClientOutputPath(ctx)
    const response = await ctx.client.call('worktrees.branchRenameFailureOutput', params)
    const parsed = z.object({ output: z.string().nullable() }).safeParse(response.result)
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_response', 'Invalid branch rename failure response.')
    }
    const { output } = parsed.data
    if (output === null) {
      printWorkspaceCommandResult(
        { ...response, result: { found: false, outputPath: null } },
        ctx.json,
        JSON.stringify
      )
      return
    }
    await writeNewClientOutputFile(outputPath, output, 'diagnostic')
    printWorkspaceCommandResult(
      { ...response, result: { found: true, outputPath, bytes: Buffer.byteLength(output) } },
      ctx.json,
      JSON.stringify
    )
  }
}
