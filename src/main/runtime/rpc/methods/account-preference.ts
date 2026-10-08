import { defineMethod } from '../core'
import { AccountPreferenceParams } from '../../../../shared/rpc-contract/account-preference-params'
import { manageAccountPreference } from '../../account-preference-access'

export const ACCOUNT_PREFERENCE_METHODS = [
  defineMethod({
    name: 'accountPreference.control',
    params: AccountPreferenceParams,
    handler: (params, { clientKind }) => {
      if (clientKind !== undefined) {
        throw new Error('Account preferences are only available on the Orca host runtime.')
      }
      return manageAccountPreference(params)
    }
  })
]
