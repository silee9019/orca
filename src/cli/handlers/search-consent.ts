import { AiVaultSearchStatusSchema } from '../../shared/ai-vault-search-contract'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

export const SEARCH_CONSENT_HANDLERS: Record<string, CommandHandler> = {
  'search consent': async ({ client, flags, json }) => {
    const host = getRequiredStringFlag(flags, 'host')
    if (!host.startsWith('runtime:') || host.length === 'runtime:'.length || !client.isRemote) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Consent requires an explicitly paired runtime host'
      )
    }
    if (getRequiredStringFlag(flags, 'confirm') !== host) {
      throw new RuntimeClientError('invalid_argument', '--confirm must match --host')
    }
    const value = getRequiredStringFlag(flags, 'enabled')
    if (value !== 'true' && value !== 'false') {
      throw new RuntimeClientError('invalid_argument', '--enabled must be true or false')
    }
    const enabled = value === 'true'
    const response = await client.call('aiVault.setSearchEnabled', { enabled })
    const status = AiVaultSearchStatusSchema.parse(response.result)
    if (status.enabled !== enabled) {
      throw new RuntimeClientError(
        'invalid_response',
        'The paired host did not confirm the requested consent'
      )
    }
    printResult({ ...response, result: { host, status } }, json, (result) =>
      JSON.stringify(result, null, 2)
    )
  }
}
