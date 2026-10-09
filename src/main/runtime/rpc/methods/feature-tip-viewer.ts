import { defineMethod } from '../core'
import { FeatureTipViewerParams } from '../../../../shared/rpc-contract/feature-tip-viewer-params'

export const FEATURE_TIP_VIEWER_METHODS = [
  defineMethod({
    name: 'ui.featureTipViewer',
    params: FeatureTipViewerParams,
    handler: (params, { runtime }) => runtime.featureTipViewer(params)
  })
]
