import { defineMethod } from '../core'
import { WorkspaceBoardParams } from '../../../../shared/rpc-contract/workspace-board-params'

export const WORKSPACE_BOARD_METHODS = [
  defineMethod({
    name: 'ui.workspaceBoardViewer',
    params: WorkspaceBoardParams,
    handler: (params, { runtime }) => runtime.workspaceBoardViewer(params)
  })
]
