import type {
  CrashReportCopyDiagnosticsArgs,
  CrashReportSubmitArgs,
  CrashReportSubmitResult
} from '../../../../shared/crash-reporting'
import type { CrashReportStore } from '../../../crash-reporting/crash-report-store'
import { dismissCrashReport } from '../../../crash-reporting/crash-report-dismissal'
import {
  getLatestPendingReport,
  getLatestSendableReport
} from '../../../ipc/crash-reporting-sendable-reports'
import {
  WorkspaceCrashReportDismiss,
  WorkspaceCrashReportCopy,
  WorkspaceCrashReportSubmit
} from '../../../../shared/rpc-contract/workspace-crash-report-params'
import { defineMethod } from '../core'

type CrashReportOperations = {
  copyLatestDiagnostics: (
    args?: CrashReportCopyDiagnosticsArgs
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  submit: (args: CrashReportSubmitArgs) => Promise<CrashReportSubmitResult>
}
let crashReportOperations: CrashReportOperations | null = null

export function setCrashReportOperationsForRpc(operations: CrashReportOperations | null): void {
  crashReportOperations = operations
}

function requireCrashReportOperations(): CrashReportOperations {
  if (!crashReportOperations) {
    throw new Error('runtime_unavailable')
  }
  return crashReportOperations
}

let crashReportStore: CrashReportStore | null = null

export function setCrashReportStoreForRpc(store: CrashReportStore | null): void {
  crashReportStore = store
}

function requireCrashReportStore(): CrashReportStore {
  if (!crashReportStore) {
    throw new Error('runtime_unavailable')
  }
  return crashReportStore
}

export const WORKSPACE_CRASH_REPORT_METHODS = [
  defineMethod({
    name: 'crashReports.copyLatestDiagnostics',
    params: WorkspaceCrashReportCopy,
    handler: async (params) => {
      const operations = requireCrashReportOperations()
      try {
        return await operations.copyLatestDiagnostics(params)
      } catch {
        throw new Error('Could not copy crash diagnostics.')
      }
    }
  }),
  defineMethod({
    name: 'crashReports.submit',
    params: WorkspaceCrashReportSubmit,
    handler: async (params) => {
      const operations = requireCrashReportOperations()
      try {
        return await operations.submit(params)
      } catch {
        throw new Error('Could not submit crash report.')
      }
    }
  }),
  defineMethod({
    name: 'crashReports.getLatestPending',
    params: null,
    handler: () => getLatestPendingReport(requireCrashReportStore())
  }),
  defineMethod({
    name: 'crashReports.getLatestReport',
    params: null,
    handler: () => getLatestSendableReport(requireCrashReportStore())
  }),
  defineMethod({
    name: 'crashReports.dismiss',
    params: WorkspaceCrashReportDismiss,
    handler: async (params) => {
      const store = requireCrashReportStore()
      try {
        return await dismissCrashReport(store, params.reportId)
      } catch {
        throw new Error('Could not persist crash report dismissal.')
      }
    }
  })
]
