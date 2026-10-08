import { defineMethod } from '../core'
import { assertLocalSshManagement } from './ssh-management'
import { getMobileConnectionManagement } from '../../../ipc/mobile-connection-management'
import {
  confirmMobileNetworkHumanAction,
  createMobileNetworkHumanAction,
  readMobileNetworkHumanAction,
  cancelMobileNetworkHumanAction,
  inspectMobileNetworkHumanAction
} from '../../mobile-network-human-actions'
import {
  MobileNetworkHumanComplete,
  MobileNetworkHumanRequest,
  MobileNetworkHumanStart
} from '../../../../shared/rpc-contract/mobile-connection-params'
export const MOBILE_NETWORK_HUMAN_METHODS = [
  defineMethod({
    name: 'mobile.networkAction.complete',
    params: MobileNetworkHumanComplete,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return { action: confirmMobileNetworkHumanAction(args.requestId, args.confirmTarget) }
    }
  }),
  defineMethod({
    name: 'mobile.networkAction.start',
    params: MobileNetworkHumanStart,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      const observation = await getMobileConnectionManagement().getWindowsFirewallStatus({
        address: args.address
      })
      if (!observation.supported) {
        throw new Error('windows_network_action_unsupported')
      }
      return { action: createMobileNetworkHumanAction(args) }
    }
  }),
  defineMethod({
    name: 'mobile.networkAction.status',
    params: MobileNetworkHumanRequest,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return { action: readMobileNetworkHumanAction(args.requestId) }
    }
  }),
  defineMethod({
    name: 'mobile.networkAction.cancel',
    params: MobileNetworkHumanRequest,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return { action: cancelMobileNetworkHumanAction(args.requestId) }
    }
  }),
  defineMethod({
    name: 'mobile.networkAction.verify',
    params: MobileNetworkHumanRequest,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      return {
        action: await inspectMobileNetworkHumanAction(args.requestId, (address) =>
          getMobileConnectionManagement().getWindowsFirewallStatus({ address })
        )
      }
    }
  })
]
