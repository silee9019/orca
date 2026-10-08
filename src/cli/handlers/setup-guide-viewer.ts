import { SetupGuideParams } from '../../shared/rpc-contract/setup-guide-params'
import { SetupGuideResultSchema } from '../../shared/setup-guide-command'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
function setupGuideHandler(operation: 'open' | 'select-step'): CommandHandler {
  return async ({ client, flags, json }) => {
    const parsed = SetupGuideParams.safeParse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation,
      ...(operation === 'select-step' ? { stepId: getRequiredStringFlag(flags, 'step') } : {})
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --viewer host and a supported --step for checklist selection.'
      )
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

export const SETUP_GUIDE_HANDLERS: Record<string, CommandHandler> = {
  'ui setup-guide open': setupGuideHandler('open'),
  'ui setup-guide select-step': setupGuideHandler('select-step')
}
