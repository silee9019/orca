import { defineMethod } from '../core'
import {
  getPtyRendererDeliveryDebugSnapshot,
  hasPtyRendererDeliveryDebugBridge,
  resetPtyRendererDeliveryDebug
} from '../../../ipc/pty/delivery/debug'
import {
  TerminalDeliveryDebugReadParams,
  TerminalDeliveryDebugResetParams
} from '../../../../shared/rpc-contract/terminal-delivery-debug-params'

function assertDeliveryDebugAvailable(): void {
  if (!hasPtyRendererDeliveryDebugBridge()) {
    throw new Error('terminal_delivery_debug_unavailable')
  }
}

export const TERMINAL_DELIVERY_DEBUG_METHODS = [
  defineMethod({
    name: 'terminal.deliveryDebug',
    params: TerminalDeliveryDebugReadParams,
    handler: () => {
      assertDeliveryDebugAvailable()
      return { snapshot: getPtyRendererDeliveryDebugSnapshot() }
    }
  }),
  defineMethod({
    name: 'terminal.resetDeliveryDebug',
    params: TerminalDeliveryDebugResetParams,
    handler: () => {
      assertDeliveryDebugAvailable()
      resetPtyRendererDeliveryDebug()
      return { reset: true }
    }
  })
]
