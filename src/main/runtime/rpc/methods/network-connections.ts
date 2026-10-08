import { defineMethod } from '../core'
import { assertLocalSshManagement } from './ssh-management'
import { testLocalNetworkConnection } from '../../../ipc/local-network-connection-test'
import { LocalNetworkConnectionTestParams } from '../../../../shared/rpc-contract/network-connection-params'
export const NETWORK_CONNECTION_METHODS = [
  defineMethod({
    name: 'network.connection.testLocal',
    params: LocalNetworkConnectionTestParams,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return testLocalNetworkConnection(args)
    }
  })
]
