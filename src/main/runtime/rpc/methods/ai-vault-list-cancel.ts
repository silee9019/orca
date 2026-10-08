import { defineMethod } from '../core'
import {
  AiVaultListCancelParams,
  AiVaultListCapabilitiesParams
} from '../../../../shared/rpc-contract/ai-vault-list-cancel-params'
import { cancelOwnedAiVaultListScan } from '../../../ai-vault/owned-list-cancellation'

export const AI_VAULT_LIST_CANCEL_METHODS = [
  defineMethod({
    name: 'aiVault.ownedListCapabilities',
    params: AiVaultListCapabilitiesParams,
    handler: (_params, { runtime }) => ({
      ownedListCancellation: 1,
      runtimeId: runtime.getRuntimeId()
    })
  }),
  defineMethod({
    name: 'aiVault.cancelOwnedListSessions',
    params: AiVaultListCancelParams,
    handler: (params, context) => {
      if (context.runtime.getRuntimeId() !== params.expectedRuntimeId) {
        throw new Error('ai_vault_runtime_changed')
      }
      return {
        cancelRequested: cancelOwnedAiVaultListScan(context, params.requestToken),
        scanStopped: false
      }
    }
  })
]
