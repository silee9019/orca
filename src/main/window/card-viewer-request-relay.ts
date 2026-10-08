import {
  CardViewerParams,
  type CardViewerCommand
} from '../../shared/rpc-contract/card-viewer-params'
import { CardViewerResultSchema, type CardViewerResult } from '../../shared/card-viewer-command'
import {
  requestRendererCommand,
  type RendererCommandWindow
} from './renderer-command-request-relay'

export function requestCardViewerFromRenderer(
  window: RendererCommandWindow,
  command: CardViewerCommand
): Promise<CardViewerResult> {
  return requestRendererCommand(
    window,
    'cardViewer',
    CardViewerParams.parse(command),
    CardViewerResultSchema,
    'renderer_timeout_persistence_unknown'
  )
}
