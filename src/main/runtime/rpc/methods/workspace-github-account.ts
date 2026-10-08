import { defineMethod } from '../core'
import { getAuthenticatedViewer, checkOrcaStarred } from '../../../github/client'
import { diagnoseGhAuth } from '../../../github/auth-diagnose'
import { starOrcaFromSource } from '../../../github/source-star-operation'
import {
  GitHubAccountDiagnostic,
  GitHubStarRequest
} from '../../../../shared/rpc-contract/workspace-github-account-params'

export const WORKSPACE_GITHUB_ACCOUNT_METHODS = [
  defineMethod({ name: 'github.viewer', params: null, handler: () => getAuthenticatedViewer() }),
  defineMethod({
    name: 'github.diagnoseAuth',
    params: GitHubAccountDiagnostic,
    handler: (params) => diagnoseGhAuth(params.host)
  }),
  defineMethod({
    name: 'github.checkOrcaStarred',
    params: null,
    handler: () => checkOrcaStarred()
  }),
  defineMethod({
    name: 'github.starOrca',
    params: GitHubStarRequest,
    handler: async (params) => ({ ok: await starOrcaFromSource(params.source) })
  })
]
