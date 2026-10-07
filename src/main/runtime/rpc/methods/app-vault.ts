import { defineMethod } from '../core'
import { AppVaultFirstPromptParams } from '../../../../shared/rpc-contract/app-vault-params'
import { AppTargetParams } from '../../../../shared/rpc-contract/app-lifecycle-params'
import { assertDesktopAppTarget } from './desktop-app-target'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'

export const APP_VAULT_METHODS = [
  defineMethod({
    name: 'appVault.firstUserPrompt',
    params: AppVaultFirstPromptParams,
    handler: async (params) =>
      (
        await import('../../../ai-vault/session-scanner-service-spawn')
      ).readAiVaultFirstUserPromptInService({ ...params, executionHostId: LOCAL_EXECUTION_HOST_ID })
  }),
  defineMethod({
    name: 'appVault.clearSearchIndex',
    params: AppTargetParams,
    handler: async (params, context) => {
      assertDesktopAppTarget(context, params.confirmTarget)
      await (
        await import('../../../ai-vault/session-scanner-service-spawn')
      ).clearSessionSearchInService()
      return { state: 'cleared' as const }
    }
  })
]
