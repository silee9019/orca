import { WorkspaceFilterParams } from '../../../../shared/rpc-contract/workspace-filter-params'
import { defineMethod } from '../core'

export const WORKSPACE_FILTER_METHODS = [
  defineMethod({
    name: 'ui.workspaceFilter',
    params: WorkspaceFilterParams,
    handler: (params, { runtime }) => runtime.workspaceFilter(params)
  })
]
