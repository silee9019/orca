import {
  SetupGuideParams,
  type SetupGuideCommand
} from '../../shared/rpc-contract/setup-guide-params'
import { SetupGuideResultSchema, type SetupGuideResult } from '../../shared/setup-guide-command'
import {
  requestRendererCommand,
  type RendererCommandWindow
} from './renderer-command-request-relay'
export function requestSetupGuideFromRenderer(
  window: RendererCommandWindow,
  command: SetupGuideCommand
): Promise<SetupGuideResult> {
  return requestRendererCommand(
    window,
    'setupGuideViewer',
    SetupGuideParams.parse(command),
    SetupGuideResultSchema,
    'renderer_timeout_applied_unknown'
  )
}
