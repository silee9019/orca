import { CardViewerParams } from '../../shared/rpc-contract/card-viewer-params'
import { CardViewerResultSchema } from '../../shared/card-viewer-command'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

function handler(operation: 'get' | 'mode' | 'activity'): CommandHandler {
  return async ({ client, flags, json }) => {
    const parsed = CardViewerParams.safeParse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation,
      ...(operation !== 'get' ? { mode: getRequiredStringFlag(flags, 'mode') } : {})
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --viewer host and a supported card mode.'
      )
    }
    try {
      const response = await client.call('ui.cardViewer', parsed.data)
      const result = CardViewerResultSchema.parse(response.result)
      printResult({ ...response, result }, json, (value) => JSON.stringify(value))
    } catch (error) {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support viewer card commands. Update the target runtime.'
        )
      }
      throw error
    }
  }
}
export const CARD_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'ui card get': handler('get'),
  'ui card mode': handler('mode'),
  'ui card activity': handler('activity')
}
