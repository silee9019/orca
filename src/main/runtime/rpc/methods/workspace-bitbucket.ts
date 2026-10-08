import { BitbucketConnect } from '../../../../shared/rpc-contract/bitbucket-params'
import {
  connectBitbucket,
  disconnectBitbucket,
  getBitbucketConnectionStatus
} from '../../../bitbucket/credential-connection'
import { _resetPreflightCache } from '../../../preflight/agent-detection'
import { defineMethod } from '../core'

export const WORKSPACE_BITBUCKET_METHODS = [
  defineMethod({
    name: 'bitbucket.connect',
    params: BitbucketConnect,
    handler: async (params) => {
      try {
        const result = await connectBitbucket(params)
        if (!result.ok) {
          return { ok: false }
        }
        _resetPreflightCache()
        return { ok: true }
      } catch {
        throw new Error('Bitbucket connection failed. Check credentials and host connectivity.')
      }
    }
  }),
  defineMethod({
    name: 'bitbucket.disconnect',
    params: null,
    handler: () => {
      disconnectBitbucket()
      _resetPreflightCache()
      return { ok: true }
    }
  }),
  defineMethod({
    name: 'bitbucket.status',
    params: null,
    handler: () => {
      const status = getBitbucketConnectionStatus()
      let apiOrigin: string | null = null
      try {
        apiOrigin = status.baseUrl ? new URL(status.baseUrl).origin : null
      } catch {
        apiOrigin = null
      }
      return {
        configured: status.configured,
        source: status.source,
        credentialProtection: status.credentialProtection,
        account: status.account,
        authMode: status.authMode,
        email: status.email,
        baseUrl: apiOrigin
      }
    }
  })
]
