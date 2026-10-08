import { SetupGuideParams } from '../../shared/rpc-contract/setup-guide-params'
import { SetupGuideResultSchema } from '../../shared/setup-guide-command'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
export const SETUP_GUIDE_HANDLERS: Record<string, CommandHandler> = {
  'ui setup-guide open': async ({ client, flags, json }) => {
    const parsed = SetupGuideParams.safeParse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation: 'open'
    })
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_argument', 'Use --viewer host to open the setup guide.')
    }
    try {
      const response = await client.call('ui.setupGuideViewer', parsed.data)
      const result = SetupGuideResultSchema.parse(response.result)
      printResult({ ...response, result }, json, (value) => JSON.stringify(value))
    } catch (error) {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support the setup guide viewer command. Update the target runtime.'
        )
      }
      throw error
    }
  }
}
