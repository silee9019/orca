import { defineMethod } from '../core'
import { ActivityViewerParams } from '../../../../shared/rpc-contract/activity-viewer-params'

export const ACTIVITY_VIEWER_METHODS = [
  defineMethod({
    name: 'ui.activityViewer',
    params: ActivityViewerParams,
    handler: (params, { runtime }) => runtime.activityViewer(params)
  })
]
