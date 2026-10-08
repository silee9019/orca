import type { CrashReportStore } from './crash-report-store'
import { inFlightSubmissions, submittedReportIds } from '../ipc/crash-reporting-sendable-reports'

export async function dismissCrashReport(store: CrashReportStore, reportId: string) {
  if (inFlightSubmissions.has(reportId)) {
    return store.getById(reportId)
  }
  if (submittedReportIds.has(reportId)) {
    const report = await store.getById(reportId)
    return report ? { ...report, status: 'sent' as const } : null
  }
  return store.dismiss(reportId)
}
