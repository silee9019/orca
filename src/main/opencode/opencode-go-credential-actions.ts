import {
  clearOpenCodeGoApiKey,
  hasOpenCodeGoApiKey,
  saveOpenCodeGoApiKey
} from '../opencode/opencode-go-api-key-store'
import type { RateLimitService } from '../rate-limits/service'
import { refreshAfterCredentialChange } from '../ipc/credential-change-rate-limit-refresh'

export type CredentialRateLimits = Pick<
  RateLimitService,
  'invalidateOpenCodeGoCredentialState' | 'refresh'
>

function getOpenCodeGoCredentialsStatus(): { apiKeyConfigured: boolean } {
  return { apiKeyConfigured: hasOpenCodeGoApiKey() }
}

function refreshAfterOpenCodeGoCredentialChange(
  rateLimits: CredentialRateLimits | null,
  apiKeyCleared: boolean
): void {
  refreshAfterCredentialChange(
    rateLimits,
    (service) => service.invalidateOpenCodeGoCredentialState({ apiKeyCleared }),
    '[opencode-go] failed to refresh usage after a credential change:'
  )
}

export function createOpenCodeGoCredentialActions(rateLimits: CredentialRateLimits | null) {
  return {
    getStatus: getOpenCodeGoCredentialsStatus,
    saveApiKey: (key: unknown) => {
      if (typeof key !== 'string') {
        throw new Error('OpenCode Go API key must be a string')
      }
      saveOpenCodeGoApiKey(key)
      refreshAfterOpenCodeGoCredentialChange(rateLimits, false)
      return getOpenCodeGoCredentialsStatus()
    },
    clearApiKey: () => {
      clearOpenCodeGoApiKey()
      refreshAfterOpenCodeGoCredentialChange(rateLimits, true)
      return getOpenCodeGoCredentialsStatus()
    }
  }
}
