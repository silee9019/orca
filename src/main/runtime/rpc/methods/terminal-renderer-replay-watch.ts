import { defineStreamingMethod } from '../core'
import { TerminalRendererReplaySubscriptionParams } from '../../../../shared/rpc-contract/terminal-renderer-replay-watch-params'
import { watchTerminalRendererRequests } from './terminal-control-watch'
export const TERMINAL_RENDERER_REPLAY_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'terminal.rendererReplay.subscribe',
    params: TerminalRendererReplaySubscriptionParams,
    handler: (params, context, emit) =>
      watchTerminalRendererRequests(params, context, emit, 'replay')
  })
]
