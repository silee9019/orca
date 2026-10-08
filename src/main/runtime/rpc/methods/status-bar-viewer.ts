import { defineMethod } from '../core'
import { StatusBarViewerParams } from '../../../../shared/rpc-contract/status-bar-viewer-params'

export const STATUS_BAR_VIEWER_METHODS = [
  defineMethod({
    name: 'ui.statusBarViewer',
    params: StatusBarViewerParams,
    handler: (params, { runtime }) => runtime.statusBarViewer(params)
  })
]
