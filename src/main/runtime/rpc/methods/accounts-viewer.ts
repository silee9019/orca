import { defineMethod } from '../core'
import { AccountsViewerParams } from '../../../../shared/rpc-contract/accounts-viewer-params'
import { requestAccountViewerAction } from '../../account-viewer-request'

export const ACCOUNTS_VIEWER_METHODS = [
  defineMethod({
    name: 'accounts.viewerAction',
    params: AccountsViewerParams,
    handler: ({ action }, { signal }) =>
      requestAccountViewerAction({ domain: 'account', action }, signal)
  })
]
