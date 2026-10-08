import {
  StatusBarViewerParams,
  type StatusBarViewerCommand
} from '../../shared/rpc-contract/status-bar-viewer-params'
import {
  StatusBarViewerResultSchema,
  type StatusBarViewerResult
} from '../../shared/status-bar-viewer-command'
import {
  requestRendererCommand,
  type RendererCommandWindow
} from './renderer-command-request-relay'

export function requestStatusBarViewerFromRenderer(
  window: RendererCommandWindow,
  command: StatusBarViewerCommand
): Promise<StatusBarViewerResult> {
  return requestRendererCommand(
    window,
    'statusBarViewer',
    StatusBarViewerParams.parse(command),
    StatusBarViewerResultSchema,
    'renderer_timeout_persistence_unknown'
  )
}
