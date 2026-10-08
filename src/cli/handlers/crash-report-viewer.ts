import { CrashReportParams } from '../../shared/rpc-contract/crash-report-params'
import { CrashReportResultSchema } from '../../shared/crash-report-command'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
export const CRASH_REPORT_HANDLERS: Record<string, CommandHandler> = {
  'ui crash-report open': async ({ client, flags, json }) => {
    const parsed = CrashReportParams.safeParse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation: 'open'
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --viewer host to open the crash report.'
      )
    }
    try {
      const response = await client.call('ui.crashReportViewer', parsed.data)
      const result = CrashReportResultSchema.parse(response.result)
      printResult({ ...response, result }, json, (value) => JSON.stringify(value))
    } catch (error) {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support the crash report viewer command. Update the target runtime.'
        )
      }
      throw error
    }
  }
}
