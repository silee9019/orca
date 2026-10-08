import { defineMethod } from '../core'
import { ResourceManagerViewerParams } from '../../../../shared/rpc-contract/resource-manager-params'

export const RESOURCE_MANAGER_METHODS = [
  defineMethod({
    name: 'resourceManager.viewer',
    params: ResourceManagerViewerParams,
    handler: async ({ action }, { signal }) =>
      (await import('../../account-viewer-request')).requestAccountViewerAction(
        { domain: 'resource', action },
        signal
      )
  })
]
