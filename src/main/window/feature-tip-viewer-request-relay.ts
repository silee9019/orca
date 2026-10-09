import {
  FeatureTipViewerParams,
  type FeatureTipViewerCommand
} from '../../shared/rpc-contract/feature-tip-viewer-params'
import {
  FeatureTipViewerResultSchema,
  type FeatureTipViewerResult
} from '../../shared/feature-tip-viewer-command'
import {
  requestRendererCommand,
  type RendererCommandWindow
} from './renderer-command-request-relay'

export function requestFeatureTipViewerFromRenderer(
  window: RendererCommandWindow,
  command: FeatureTipViewerCommand
): Promise<FeatureTipViewerResult> {
  return requestRendererCommand(
    window,
    'featureTipViewer',
    FeatureTipViewerParams.parse(command),
    FeatureTipViewerResultSchema,
    'renderer_timeout_persistence_unknown'
  )
}
