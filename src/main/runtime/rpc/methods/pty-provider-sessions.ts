import { defineMethod } from '../core'
import { PtyProviderSessionsParams } from '../../../../shared/rpc-contract/pty-provider-sessions-params'

export const PTY_PROVIDER_SESSION_METHODS = [
  defineMethod({
    name: 'terminal.listProviderSessions',
    params: PtyProviderSessionsParams,
    handler: async (params, { runtime }) => {
      const scope = 'connectionId' in params ? { connectionId: params.connectionId } : undefined
      return {
        scope: scope ?? null,
        ...(scope === undefined ? { complete: false } : {}),
        sessions: await runtime.listProviderSessions(scope)
      }
    }
  })
]
