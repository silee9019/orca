import { z } from 'zod'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import {
  WorkspaceCrashReportDismiss,
  WorkspaceCrashReportCopy,
  WorkspaceCrashReportSubmit
} from '../../shared/rpc-contract/workspace-crash-report-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { resolveClientOutputPath, writeNewClientOutputFile } from '../workspace-client-output-file'

const CrashReportMetadata = z.object({
  id: z.string(),
  status: z.enum(['pending', 'sent', 'dismissed'])
})

function reportMetadata(value: unknown) {
  const parsed = CrashReportMetadata.nullable().safeParse(value)
  if (!parsed.success) {
    throw new RuntimeClientError('invalid_response', 'Invalid crash report response.')
  }
  return parsed.data
}

async function exportCrashReport(
  ctx: HandlerContext,
  method: 'crashReports.getLatestPending' | 'crashReports.getLatestReport'
): Promise<void> {
  const outputPath = resolveClientOutputPath(ctx)
  const response = await ctx.client.call(method)
  const metadata = reportMetadata(response.result)
  await writeNewClientOutputFile(
    outputPath,
    `${JSON.stringify(response.result, null, 2)}\n`,
    'report'
  )
  const result = {
    outputPath,
    reportId: metadata?.id ?? null,
    status: metadata?.status ?? null
  }
  printWorkspaceCommandResult({ ...response, result }, ctx.json, (value) => JSON.stringify(value))
}

export const WORKSPACE_CRASH_REPORT_HANDLERS: Record<string, CommandHandler> = {
  'crash-report copy-diagnostics': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkspaceCrashReportCopy)
    confirmWorkspaceCommand(ctx, 'host-clipboard')
    const response = await ctx.client.call('crashReports.copyLatestDiagnostics', params)
    const parsed = z.object({ ok: z.boolean() }).safeParse(response.result)
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_response', 'Invalid clipboard response.')
    }
    printWorkspaceCommandResult({ ...response, result: parsed.data }, ctx.json, (value) =>
      JSON.stringify(value)
    )
  },
  'crash-report submit': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkspaceCrashReportSubmit)
    confirmWorkspaceCommand(ctx, params.reportId ?? 'uncaptured')
    const response = await ctx.client.call('crashReports.submit', params)
    const parsed = z
      .object({ ok: z.boolean(), report: CrashReportMetadata.nullable().optional() })
      .safeParse(response.result)
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_response', 'Invalid submission response.')
    }
    const result = {
      ok: parsed.data.ok,
      reportId: parsed.data.report?.id ?? null,
      status: parsed.data.report?.status ?? null
    }
    printWorkspaceCommandResult({ ...response, result }, ctx.json, (value) => JSON.stringify(value))
  },
  'crash-report latest-pending': (ctx) => exportCrashReport(ctx, 'crashReports.getLatestPending'),
  'crash-report latest': (ctx) => exportCrashReport(ctx, 'crashReports.getLatestReport'),
  'crash-report dismiss': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkspaceCrashReportDismiss)
    confirmWorkspaceCommand(ctx, params.reportId)
    const response = await ctx.client.call('crashReports.dismiss', params)
    const metadata = reportMetadata(response.result)
    if (!metadata) {
      throw new RuntimeClientError('selector_not_found', 'Report not found.')
    }
    if (metadata.status === 'pending') {
      throw new RuntimeClientError('operation_in_progress', 'Report submission is in progress.')
    }
    const result = {
      reportId: metadata.id,
      status: metadata.status,
      dismissed: metadata.status === 'dismissed'
    }
    printWorkspaceCommandResult({ ...response, result }, ctx.json, (value) => JSON.stringify(value))
  }
}
