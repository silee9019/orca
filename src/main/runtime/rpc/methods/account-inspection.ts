import { defineMethod } from '../core'
import { AccountInspectionParams } from '../../../../shared/rpc-contract/account-inspection-params'

export const ACCOUNT_INSPECTION_METHODS = [
  defineMethod({
    name: 'accounts.inspect',
    params: AccountInspectionParams,
    handler: (params, { runtime }) => runtime.getAccountInspectionController().inspect(params)
  })
]
