import { defineMethod } from '../core'
import {
  AccountLoginProviderParams,
  AccountLoginStartParams
} from '../../../../shared/rpc-contract/account-login-params'

export const ACCOUNT_LOGIN_METHODS = [
  defineMethod({
    name: 'accounts.loginUrl',
    params: null,
    handler: (_, { runtime, clientKind }) => {
      if (clientKind !== undefined) {
        throw new Error('Account login is only available on the Orca host runtime.')
      }
      return { url: runtime.getCodexLoginUrl() }
    }
  }),
  defineMethod({
    name: 'accounts.loginStart',
    params: AccountLoginStartParams,
    handler: (params, { runtime, clientKind }) => {
      if (clientKind !== undefined) {
        throw new Error('Account login is only available on the Orca host runtime.')
      }
      return runtime.manageAccountLogin({ ...params, action: 'start' })
    }
  }),
  defineMethod({
    name: 'accounts.loginStatus',
    params: AccountLoginProviderParams,
    handler: (params, { runtime, clientKind }) => {
      if (clientKind !== undefined) {
        throw new Error('Account login is only available on the Orca host runtime.')
      }
      return runtime.manageAccountLogin({ ...params, action: 'status' })
    }
  }),
  defineMethod({
    name: 'accounts.loginCancel',
    params: AccountLoginProviderParams,
    handler: (params, { runtime, clientKind }) => {
      if (clientKind !== undefined) {
        throw new Error('Account login is only available on the Orca host runtime.')
      }
      return runtime.manageAccountLogin({ ...params, action: 'cancel' })
    }
  })
] as const
