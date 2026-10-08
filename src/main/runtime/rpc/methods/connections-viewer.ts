import { defineMethod } from '../core'
import { assertLocalSshManagement } from './ssh-management'
import { requestConnectionsViewer } from '../../../ipc/connections-viewer-management'
import { ConnectionsViewerParams } from '../../../../shared/rpc-contract/connections-viewer-params'
export const CONNECTIONS_VIEWER_METHODS = [
  defineMethod({
    name: 'connections.viewer.apply',
    params: ConnectionsViewerParams,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return requestConnectionsViewer(args)
    }
  })
]
