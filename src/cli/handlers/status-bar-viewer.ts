import { StatusBarViewerParams } from '../../shared/rpc-contract/status-bar-viewer-params'
import { StatusBarViewerResultSchema } from '../../shared/status-bar-viewer-command'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
function handler(operation: 'get' | 'toggle' | 'item' | 'percentage'): CommandHandler {
  return async ({ client, flags, json }) => {
    const enabled = operation === 'item' ? getRequiredStringFlag(flags, 'enabled') : undefined
    const parsed = StatusBarViewerParams.safeParse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation,
      ...(operation === 'item'
        ? {
            item: getRequiredStringFlag(flags, 'item'),
            enabled: enabled === 'true' ? true : enabled === 'false' ? false : enabled
          }
        : {}),
      ...(operation === 'percentage' ? { display: getRequiredStringFlag(flags, 'display') } : {})
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --viewer host and a supported status bar value. --enabled requires true or false.'
      )
    }
    try {
      const response = await client.call('ui.statusBarViewer', parsed.data)
      const result = StatusBarViewerResultSchema.parse(response.result)
      printResult({ ...response, result }, json, (value) => JSON.stringify(value))
    } catch (error) {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support viewer status bar commands. Update the target runtime.'
        )
      }
      throw error
    }
  }
}
export const STATUS_BAR_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'ui status-bar get': handler('get'),
  'ui status-bar toggle': handler('toggle'),
  'ui status-bar item': handler('item'),
  'ui status-bar percentage': handler('percentage')
}
