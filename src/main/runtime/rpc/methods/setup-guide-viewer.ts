import { defineMethod } from '../core'
import { SetupGuideParams } from '../../../../shared/rpc-contract/setup-guide-params'
export const SETUP_GUIDE_METHODS = [
  defineMethod({
    name: 'ui.setupGuideViewer',
    params: SetupGuideParams,
    handler: (params, { runtime }) => runtime.setupGuideViewer(params)
  })
]
