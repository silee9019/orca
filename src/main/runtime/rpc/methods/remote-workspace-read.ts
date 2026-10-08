import { defineMethod } from '../core'
import { getActiveMultiplexer, getSshConnectionStore } from '../../../ipc/ssh'
import { getRemoteSnapshot } from '../../../ipc/remote-workspace-relay-sync'
import { CLIENT_ID } from '../../../ipc/remote-workspace-client-identity'
import { listRemoteWorkspaceConnectedClients } from '../../../ipc/remote-workspace-connected-clients'
import {
  RemoteWorkspaceReadParams,
  RemoteWorkspaceClientsParams,
  RemoteWorkspaceInventoryParams
} from '../../../../shared/rpc-contract/remote-workspace-read-params'

function requireConnectionStore() {
  const store = getSshConnectionStore()
  if (!store) {
    throw new Error('remote_workspace_connection_store_unavailable')
  }
  return store
}

export const REMOTE_WORKSPACE_READ_METHODS = [
  defineMethod({
    name: 'remoteWorkspace.get',
    params: RemoteWorkspaceReadParams,
    handler: async (params) => {
      const target = requireConnectionStore().getTarget(params.targetId)
      return { snapshot: target ? await getRemoteSnapshot(target) : null }
    }
  }),
  defineMethod({
    name: 'remoteWorkspace.listEnabledConnectedTargets',
    params: RemoteWorkspaceInventoryParams,
    handler: () => ({
      targetIds: requireConnectionStore()
        .listTargets()
        .filter((target) => getActiveMultiplexer(target.id))
        .map((target) => target.id)
    })
  }),
  defineMethod({
    name: 'remoteWorkspace.listConnectedClients',
    params: RemoteWorkspaceClientsParams,
    handler: async (params, { runtime }) => {
      requireConnectionStore()
      return {
        complete: false,
        targets: await listRemoteWorkspaceConnectedClients(params, runtime)
      }
    }
  }),
  defineMethod({
    name: 'remoteWorkspace.clientId',
    params: RemoteWorkspaceInventoryParams,
    handler: () => ({ clientId: CLIENT_ID })
  })
]
