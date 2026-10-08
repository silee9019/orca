import { defineMethod } from '../core'
import { WorkspaceCleanupDismiss } from '../../../../shared/rpc-contract/workspace-cleanup-dismissal-params'

export const WORKSPACE_CLEANUP_DISMISSAL_METHODS = [
  defineMethod({
    name: 'workspaceCleanup.dismiss',
    params: WorkspaceCleanupDismiss,
    handler: (params, { runtime }) => runtime.dismissWorkspaceCleanup(params)
  }),
  defineMethod({
    name: 'workspaceCleanup.clearDismissals',
    params: null,
    handler: (_params, { runtime }) => runtime.dismissWorkspaceCleanup()
  })
]
