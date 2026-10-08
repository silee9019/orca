import {
  CrashReportParams,
  type CrashReportCommand
} from '../../shared/rpc-contract/crash-report-params'
import { CrashReportResultSchema, type CrashReportResult } from '../../shared/crash-report-command'
import {
  requestRendererCommand,
  type RendererCommandWindow
} from './renderer-command-request-relay'
export function requestCrashReportFromRenderer(
  window: RendererCommandWindow,
  command: CrashReportCommand
): Promise<CrashReportResult> {
  return requestRendererCommand(
    window,
    'crashReportViewer',
    CrashReportParams.parse(command),
    CrashReportResultSchema,
    'renderer_timeout_applied_unknown'
  )
}
