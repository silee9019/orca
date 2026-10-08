import {
  FeatureTourParams,
  type FeatureTourCommand
} from '../../shared/rpc-contract/feature-tour-params'
import { FeatureTourResultSchema, type FeatureTourResult } from '../../shared/feature-tour-command'
import {
  requestRendererCommand,
  type RendererCommandWindow
} from './renderer-command-request-relay'
export function requestFeatureTourFromRenderer(
  window: RendererCommandWindow,
  command: FeatureTourCommand
): Promise<FeatureTourResult> {
  return requestRendererCommand(
    window,
    'featureTourViewer',
    FeatureTourParams.parse(command),
    FeatureTourResultSchema,
    'renderer_timeout_applied_unknown'
  )
}
