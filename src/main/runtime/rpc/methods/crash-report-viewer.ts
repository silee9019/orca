import { defineMethod } from '../core'
import { CrashReportParams } from '../../../../shared/rpc-contract/crash-report-params'
export const CRASH_REPORT_METHODS = [
  defineMethod({
    name: 'ui.crashReportViewer',
    params: CrashReportParams,
    handler: (params, { runtime }) => runtime.crashReportViewer(params)
  })
]
