import { defineMethod } from '../core'
import { SidebarViewerParams } from '../../../../shared/rpc-contract/sidebar-viewer-params'

export const SIDEBAR_VIEWER_METHODS = [
  defineMethod({
    name: 'ui.sidebarViewer',
    params: SidebarViewerParams,
    handler: (params, { runtime }) => runtime.sidebarViewer(params)
  })
]
