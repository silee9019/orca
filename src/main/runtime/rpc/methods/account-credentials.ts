import { defineMethod } from '../core'
import {
  AccountCredentialSaveParams,
  AccountCredentialStatusParams
} from '../../../../shared/rpc-contract/account-credentials-params'

export const ACCOUNT_CREDENTIAL_METHODS = [
  defineMethod({
    name: 'accountCredentials.status',
    params: AccountCredentialStatusParams,
    handler: (params, { runtime, clientKind }) => {
      if (clientKind !== undefined) {
        throw new Error('Credential management is only available on the Orca host runtime.')
      }
      return runtime.manageAccountCredential({ ...params, action: 'status' })
    }
  }),
  defineMethod({
    name: 'accountCredentials.save',
    params: AccountCredentialSaveParams,
    handler: (params, { runtime, clientKind }) => {
      if (clientKind !== undefined) {
        throw new Error('Credential management is only available on the Orca host runtime.')
      }
      return runtime.manageAccountCredential({ ...params, action: 'save' })
    }
  }),
  defineMethod({
    name: 'accountCredentials.clear',
    params: AccountCredentialStatusParams,
    handler: (params, { runtime, clientKind }) => {
      if (clientKind !== undefined) {
        throw new Error('Credential management is only available on the Orca host runtime.')
      }
      return runtime.manageAccountCredential({ ...params, action: 'clear' })
    }
  })
] as const
