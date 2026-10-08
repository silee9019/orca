import { defineMethod } from '../core'
import { TerminalListenerCountParams } from '../../../../shared/rpc-contract/terminal-listener-count-params'
export const TERMINAL_LISTENER_COUNT_METHODS = [
  defineMethod({
    name: 'terminal.dataListenerCount',
    params: TerminalListenerCountParams,
    handler: async (params, { runtime, signal }) => {
      if (runtime.getRuntimeId() !== params.expectedRuntimeId) {
        throw new Error('renderer_listener_count_runtime_changed')
      }
      const count = await runtime.readPtyDataListenerCount(
        params.expectedRendererId,
        params.timeoutMs,
        signal
      )
      if (signal?.aborted || runtime.getRuntimeId() !== params.expectedRuntimeId) {
        throw new Error('renderer_listener_count_runtime_changed_or_cancelled')
      }
      return {
        expectedRuntimeId: params.expectedRuntimeId,
        executionHostId: params.executionHostId,
        rendererId: params.expectedRendererId,
        count,
        source: 'preload-pty-data-listeners',
        ptyDeliveryVerified: false
      }
    }
  })
]
