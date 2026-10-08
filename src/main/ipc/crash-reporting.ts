import { dismissCrashReport } from '../crash-reporting/crash-report-dismissal'
import {
  setCrashReportStoreForRpc,
  setCrashReportOperationsForRpc
} from '../runtime/rpc/methods/workspace-crash-reports'
import { clipboard, ipcMain } from 'electron'
import {
  type CrashReportCopyDiagnosticsArgs,
  type CrashReportSubmitArgs,
  formatCrashReportText
} from '../../shared/crash-reporting'
import type { CrashReportStore } from '../crash-reporting/crash-report-store'
import { rendererCrashBreadcrumbOrigin } from '../../shared/crash-breadcrumb-origin'
import {
  assertClipboardTextWriteWithinLimit,
  isClipboardTextWriteTooLargeError
} from '../../shared/clipboard-text'
import { formatCrashReportCopyText } from '../crash-reporting/crash-report-copy-text'
import {
  recentRendererErrorReportKeys,
  recordRendererErrorReport
} from './crash-reporting-renderer-error-report'
import { recordRendererBreadcrumbFromRenderer } from './crash-reporting-renderer-breadcrumbs'
import {
  getLatestPendingReport,
  getLatestSendableReport,
  getRequestedCrashReport,
  inFlightSubmissions,
  submittedReportIds
} from './crash-reporting-sendable-reports'
import { buildUncapturedCrashReportText, submitCrashReport } from './crash-reporting-submission'

export function _resetRendererErrorReportDedupeForTests(): void {
  recentRendererErrorReportKeys.clear()
  submittedReportIds.clear()
  inFlightSubmissions.clear()
}

export function _getCrashReportingStateSizesForTests(): {
  submittedReportIds: number
  inFlightSubmissions: number
  recentRendererErrorReportKeys: number
} {
  return {
    submittedReportIds: submittedReportIds.size,
    inFlightSubmissions: inFlightSubmissions.size,
    recentRendererErrorReportKeys: recentRendererErrorReportKeys.size
  }
}

export function registerCrashReportingHandlers(store: CrashReportStore): void {
  setCrashReportStoreForRpc(store)
  ipcMain.removeHandler('crashReports:getLatestPending')
  ipcMain.handle('crashReports:getLatestPending', () => getLatestPendingReport(store))

  ipcMain.removeHandler('crashReports:getLatestReport')
  ipcMain.handle('crashReports:getLatestReport', () => getLatestSendableReport(store))

  ipcMain.removeHandler('crashReports:dismiss')
  ipcMain.handle('crashReports:dismiss', (_event, args: { reportId: string }) =>
    dismissCrashReport(store, args.reportId)
  )

  ipcMain.removeAllListeners('crashReports:recordBreadcrumb')
  ipcMain.on(
    'crashReports:recordBreadcrumb',
    (event, args?: { name?: unknown; data?: unknown }) => {
      const senderId = event?.sender?.id
      recordRendererBreadcrumbFromRenderer(
        args,
        typeof senderId === 'number' ? rendererCrashBreadcrumbOrigin(senderId) : undefined
      )
    }
  )

  const copyLatestDiagnostics = async (args?: CrashReportCopyDiagnosticsArgs) => {
    const report = await getRequestedCrashReport(store, args)
    const baseText = report
      ? formatCrashReportText(report, args?.notes)
      : buildUncapturedCrashReportText(args?.notes)
    try {
      clipboard.writeText(
        assertClipboardTextWriteWithinLimit(
          formatCrashReportCopyText(baseText, args?.submissionFailure)
        )
      )
    } catch (error) {
      if (isClipboardTextWriteTooLargeError(error)) {
        return { ok: false as const, error: 'Crash diagnostics are too large to copy safely.' }
      }
      throw error
    }
    return { ok: true as const }
  }
  const submit = (args: CrashReportSubmitArgs) => submitCrashReport(store, args)
  setCrashReportOperationsForRpc({ copyLatestDiagnostics, submit })
  ipcMain.removeHandler('crashReports:copyLatestDiagnostics')
  ipcMain.handle(
    'crashReports:copyLatestDiagnostics',
    (_event, args?: CrashReportCopyDiagnosticsArgs) => copyLatestDiagnostics(args)
  )

  ipcMain.removeHandler('crashReports:recordRendererError')
  ipcMain.handle('crashReports:recordRendererError', async (event, args: unknown) => {
    try {
      return await recordRendererErrorReport(store, args, event?.sender?.id)
    } catch (error) {
      console.error('[crash-reporting] Failed to record renderer error report:', error)
      return { ok: false, error: 'Failed to record renderer error report.' }
    }
  })

  ipcMain.removeHandler('crashReports:submit')
  ipcMain.handle('crashReports:submit', (_event, args: CrashReportSubmitArgs) => submit(args))
}
