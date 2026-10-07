import { defineMethod } from '../core'
import { ProfileAuthControlParams } from '../../../../shared/rpc-contract/profile-auth-params'

export const PROFILE_AUTH_METHODS = [
  defineMethod({
    name: 'profileAuth.control',
    params: ProfileAuthControlParams,
    handler: (params, { runtime, clientKind }) => {
      if (clientKind !== undefined) {
        throw new Error('Orca profile authentication is only available on the Orca host runtime.')
      }
      return runtime.manageProfileAuth(params)
    }
  })
]
