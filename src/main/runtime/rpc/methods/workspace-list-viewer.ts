import { defineMethod } from '../core'
import { WorkspaceListViewerParams } from '../../../../shared/rpc-contract/workspace-list-viewer-params'

export const WORKSPACE_LIST_VIEWER_METHODS = [
  defineMethod({
    name: 'ui.workspaceListViewer',
    params: WorkspaceListViewerParams,
    handler: (params, { runtime }) => runtime.workspaceListViewer(params)
  })
]
