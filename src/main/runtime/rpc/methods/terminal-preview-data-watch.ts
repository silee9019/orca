import { defineStreamingMethod } from '../core'
import { TerminalPreviewDataSubscriptionParams } from '../../../../shared/rpc-contract/terminal-preview-data-watch-params'
import { watchTerminalRendererRequests } from './terminal-control-watch'
export const TERMINAL_PREVIEW_DATA_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'terminal.previewData.subscribe',
    params: TerminalPreviewDataSubscriptionParams,
    handler: (params, context, emit) =>
      watchTerminalRendererRequests(params, context, emit, 'preview')
  })
]
