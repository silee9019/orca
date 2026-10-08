import { defineMethod } from '../core'

export const WORKSPACE_CACHED_SCAN_METHODS = [
  defineMethod({
    name: 'workspaceCleanup.getCachedScan',
    params: null,
    handler: (_params, { runtime }) => runtime.getCachedWorkspaceCleanupScan()
  }),
  defineMethod({
    name: 'workspaceSpace.getCachedAnalysis',
    params: null,
    handler: (_params, { runtime }) => runtime.getCachedWorkspaceSpaceAnalysis()
  })
]
