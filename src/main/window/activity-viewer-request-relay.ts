import {
  ActivityViewerParams,
  type ActivityViewerCommand
} from '../../shared/rpc-contract/activity-viewer-params'
import {
  ActivityViewerResultSchema,
  type ActivityViewerResult
} from '../../shared/activity-viewer-command'
import {
  requestRendererCommand,
  type RendererCommandWindow
} from './renderer-command-request-relay'

export async function requestActivityViewerFromRenderer(
  window: RendererCommandWindow,
  command: ActivityViewerCommand
): Promise<ActivityViewerResult> {
  const result = await requestRendererCommand(
    window,
    'activityViewer',
    ActivityViewerParams.parse(command),
    ActivityViewerResultSchema,
    'renderer_timeout_persistence_unknown'
  )
  if (result.surface !== command.surface) {
    throw new Error('invalid_viewer_response')
  }
  return result
}
