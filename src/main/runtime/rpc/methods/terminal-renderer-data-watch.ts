import { defineStreamingMethod } from '../core'
import { TerminalRendererDataSubscriptionParams } from '../../../../shared/rpc-contract/terminal-renderer-data-watch-params'
import { watchTerminalRendererRequests } from './terminal-control-watch'
export const TERMINAL_RENDERER_DATA_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'terminal.rendererData.subscribe',
    params: TerminalRendererDataSubscriptionParams,
    handler: (params, context, emit) => watchTerminalRendererRequests(params, context, emit, 'data')
  })
]
