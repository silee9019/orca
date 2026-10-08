import { defineMethod } from '../core'
import { RemoteWorkspacePublishParams } from '../../../../shared/rpc-contract/remote-workspace-publish-params'

export const REMOTE_WORKSPACE_PUBLISH_METHODS = [
  defineMethod({
    name: 'remoteWorkspace.publishTargets',
    params: RemoteWorkspacePublishParams,
    handler: async (params, { runtime, signal }) => {
      signal?.throwIfAborted()
      return runtime.publishRemoteWorkspaceTargets(params)
    }
  })
]
