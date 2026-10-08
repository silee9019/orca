import { defineMethod } from '../core'
import { FeatureTourParams } from '../../../../shared/rpc-contract/feature-tour-params'
export const FEATURE_TOUR_METHODS = [
  defineMethod({
    name: 'ui.featureTourViewer',
    params: FeatureTourParams,
    handler: (params, { runtime }) => runtime.featureTourViewer(params)
  })
]
