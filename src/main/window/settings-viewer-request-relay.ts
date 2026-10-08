import {
  SettingsViewerParams,
  type SettingsViewerCommand
} from '../../shared/rpc-contract/settings-viewer-params'
import {
  SettingsViewerResultSchema,
  type SettingsViewerResult
} from '../../shared/settings-viewer-command'
import {
  requestRendererCommand,
  type RendererCommandWindow
} from './renderer-command-request-relay'

export function requestSettingsViewerFromRenderer(
  window: RendererCommandWindow,
  command: SettingsViewerCommand
): Promise<SettingsViewerResult> {
  return requestRendererCommand(
    window,
    'settingsViewer',
    SettingsViewerParams.parse(command),
    SettingsViewerResultSchema,
    'renderer_timeout_applied_unknown'
  )
}
