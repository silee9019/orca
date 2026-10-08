import type { CommandHandler } from '../dispatch'
import { DesktopDiagnosticPreviewOpen } from '../../shared/rpc-contract/workspace-diagnostic-preview-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_DIAGNOSTIC_PREVIEW_HANDLERS: Record<string, CommandHandler> = {
  'diagnostics open-retained-preview': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopDiagnosticPreviewOpen)
    confirmWorkspaceCommand(ctx, params.bundleSubmissionId)
    const response = await ctx.client.call('diagnostics.openRetainedPreview', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
