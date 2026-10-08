import { defineMethod } from '../core'
import {
  AiVaultDeleteSessionParams,
  AiVaultSubagentSessionsParams
} from '../../../../shared/rpc-contract/ai-vault-session-actions-params'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { deleteAiVaultSession } from '../../../ipc/ai-vault-delete'
import { listAiVaultSubagentSessions } from '../../../ipc/ai-vault-subagent-list'
import { invalidateAiVaultHostLegCache } from '../../../ipc/ai-vault-host-leg-cache'

export const AI_VAULT_SESSION_ACTION_METHODS = [
  defineMethod({
    name: 'aiVault.deleteSession',
    params: AiVaultDeleteSessionParams,
    handler: (params) =>
      deleteAiVaultSession(
        { ...params, executionHostId: LOCAL_EXECUTION_HOST_ID },
        { invalidateMultiHostListCache: invalidateAiVaultHostLegCache }
      )
  }),
  defineMethod({
    name: 'aiVault.listSubagentSessions',
    params: AiVaultSubagentSessionsParams,
    handler: (params) =>
      listAiVaultSubagentSessions({
        ...params,
        executionHostId: LOCAL_EXECUTION_HOST_ID
      })
  })
]
