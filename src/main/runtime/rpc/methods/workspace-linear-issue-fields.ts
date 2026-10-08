import { defineMethod } from '../core'
import { ConcreteIssueUpdate } from '../../../../shared/rpc-contract/linear-params'

export const WORKSPACE_LINEAR_ISSUE_FIELD_METHODS = [
  defineMethod({
    name: 'linear.updateIssueFields',
    params: ConcreteIssueUpdate,
    handler: (params, { runtime }) =>
      runtime.linearUpdateIssue(params.id.trim(), params.updates, params.workspaceId)
  })
]
