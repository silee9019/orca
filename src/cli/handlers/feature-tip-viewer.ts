import { FeatureTipViewerParams } from '../../shared/rpc-contract/feature-tip-viewer-params'
import { FeatureTipViewerResultSchema } from '../../shared/feature-tip-viewer-command'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, rejectValuelessFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

function handler(operation: 'get' | 'skip'): CommandHandler {
  return async ({ client, flags, json }) => {
    // Why: an empty --tip must reach validation, not read as no --tip and skip whichever tip is open.
    const tipId = flags.get('tip')
    rejectValuelessFlag(tipId, 'tip')
    const parsed = FeatureTipViewerParams.safeParse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation,
      ...(typeof tipId === 'string' ? { tipId } : {})
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --viewer host and, for skip, a known --tip id.'
      )
    }
    try {
      const response = await client.call('ui.featureTipViewer', parsed.data)
      const result = FeatureTipViewerResultSchema.parse(response.result)
      printResult({ ...response, result }, json, (value) => JSON.stringify(value))
    } catch (error) {
      // Why: the request already passed this schema, so a host that rejects a skip as invalid predates it.
      if (
        error instanceof RuntimeClientError &&
        (error.code === 'method_not_found' ||
          (operation === 'skip' && error.code === 'invalid_argument'))
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'Update the target runtime to use feature tip commands.'
        )
      }
      throw error
    }
  }
}
export const FEATURE_TIP_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'ui feature-tip get': handler('get'),
  'ui feature-tip skip': handler('skip')
}
