import { defineMethod } from '../core'
import { CardViewerParams } from '../../../../shared/rpc-contract/card-viewer-params'

export const CARD_VIEWER_METHODS = [
  defineMethod({
    name: 'ui.cardViewer',
    params: CardViewerParams,
    handler: (params, { runtime }) => runtime.cardViewer(params)
  })
]
