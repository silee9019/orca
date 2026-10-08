import { defineStreamingMethod } from '../core'
import { RemoteWorkspaceSubscriptionParams } from '../../../../shared/rpc-contract/remote-workspace-watch-params'
import { subscribeRemoteWorkspaceChanges } from '../../../ipc/remote-workspace-change-observers'
import { getSshConnectionStore } from '../../../ipc/ssh'
import { createRuntimeJsonEventSubscription } from '../../runtime-json-event-subscription'

export const REMOTE_WORKSPACE_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'remoteWorkspace.subscribe',
    params: RemoteWorkspaceSubscriptionParams,
    handler: async (params, context, emit) => {
      const store = getSshConnectionStore()
      if (!store || !params.targetIds.every((id) => store.getTarget(id))) {
        emit({ type: 'error', code: 'remote_workspace_unavailable' })
        return
      }
      const stream = createRuntimeJsonEventSubscription(
        context,
        'remoteWorkspace',
        params.subscriptionId,
        emit,
        () => {
          if (getSshConnectionStore() !== store) {
            throw new Error('remote_workspace_unavailable')
          }
        }
      )
      const selected = new Set(params.targetIds)
      try {
        stream.register(
          subscribeRemoteWorkspaceChanges(
            (change) => {
              if (selected.has(change.targetId)) {
                stream.event({ change })
              }
            },
            () => {
              try {
                emit({ type: 'error', code: 'remote_workspace_unavailable' })
              } finally {
                stream.close()
              }
            }
          )
        )
        stream.ready({ targetIds: params.targetIds })
      } catch (error) {
        stream.close()
        throw error
      }
    }
  })
]
