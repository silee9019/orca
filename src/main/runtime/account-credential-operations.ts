import type { RateLimitService } from '../rate-limits/service'
import type { AccountCredentialOperation } from '../../shared/rpc-contract/account-credentials-params'
import { BitbucketCredentialInput } from '../../shared/rpc-contract/account-credentials-params'
import {
  connectBitbucket,
  disconnectBitbucket,
  getBitbucketConnectionStatus
} from '../bitbucket/credential-connection'
import { _resetPreflightCache } from '../preflight/agent-detection'
import { createMiniMaxCredentialActions } from '../minimax/minimax-credential-actions'
import { createOpenCodeGoCredentialActions } from '../opencode/opencode-go-credential-actions'
import { createZcodePlanCredentialActions } from '../zcode/zcode-plan-credential-actions'

export function manageAccountCredential(
  operation: AccountCredentialOperation,
  rateLimits: RateLimitService
) {
  if (operation.provider === 'bitbucket') {
    if (operation.action === 'save') {
      let input: unknown
      try {
        input = JSON.parse(operation.secret)
      } catch {
        throw new Error('Bitbucket credential input must be a JSON object.')
      }
      const parsed = BitbucketCredentialInput.safeParse(input)
      if (!parsed.success) {
        throw new Error(
          'Bitbucket credentials require token accessToken or basic email/apiToken, and an optional baseUrl.'
        )
      }
      return connectBitbucket(parsed.data).then((result) => {
        if (result.ok) {
          _resetPreflightCache()
        }
        return result
      })
    }
    if (operation.action === 'clear') {
      disconnectBitbucket()
      _resetPreflightCache()
    }
    const status = getBitbucketConnectionStatus()
    return {
      configured: status.configured,
      source: status.source,
      credentialProtection: status.credentialProtection,
      account: status.account
    }
  }
  if (operation.provider === 'minimax-cookie' || operation.provider === 'minimax-api-key') {
    const actions = createMiniMaxCredentialActions(rateLimits)
    if (operation.action === 'status') {
      return actions.getStatus()
    }
    if (operation.provider === 'minimax-cookie') {
      return operation.action === 'save'
        ? actions.saveCookie(operation.secret)
        : actions.clearCookie()
    }
    return operation.action === 'save'
      ? actions.saveApiKey(operation.secret)
      : actions.clearApiKey()
  }
  const actions =
    operation.provider === 'opencode-go'
      ? createOpenCodeGoCredentialActions(rateLimits)
      : createZcodePlanCredentialActions(rateLimits)
  if (operation.action === 'status') {
    return actions.getStatus()
  }
  return operation.action === 'save' ? actions.saveApiKey(operation.secret) : actions.clearApiKey()
}
