import { applyAccountSecretSetting } from '../../account-secret-settings-writer'
import { defineMethod } from '../core'
import { AccountSecretSettingParams } from '../../../../shared/rpc-contract/account-secret-settings-params'

export const ACCOUNT_SECRET_SETTING_METHODS = [
  defineMethod({
    name: 'accountSecretSettings.apply',
    params: AccountSecretSettingParams,
    handler: (params, { clientKind }) => {
      if (clientKind !== undefined) {
        throw new Error('Sensitive settings are only available on the Orca host runtime.')
      }
      return applyAccountSecretSetting(params)
    }
  })
]
