import { FeatureTourParams } from '../../shared/rpc-contract/feature-tour-params'
import { FeatureTourResultSchema } from '../../shared/feature-tour-command'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
export const FEATURE_TOUR_HANDLERS: Record<string, CommandHandler> = {
  'ui feature-tour open': async ({ client, flags, json }) => {
    const parsed = FeatureTourParams.safeParse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation: 'open'
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --viewer host to open the feature tour.'
      )
    }
    try {
      const response = await client.call('ui.featureTourViewer', parsed.data)
      const result = FeatureTourResultSchema.parse(response.result)
      printResult({ ...response, result }, json, (value) => JSON.stringify(value))
    } catch (error) {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support the feature tour viewer command. Update the target runtime.'
        )
      }
      throw error
    }
  }
}
