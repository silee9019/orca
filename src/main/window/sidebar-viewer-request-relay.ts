import {
  SidebarViewerParams,
  type SidebarViewerCommand
} from '../../shared/rpc-contract/sidebar-viewer-params'
import {
  SidebarViewerResultSchema,
  type SidebarViewerResult
} from '../../shared/sidebar-viewer-command'
import {
  requestRendererCommand,
  type RendererCommandWindow
} from './renderer-command-request-relay'

export function requestSidebarViewerFromRenderer(
  window: RendererCommandWindow,
  command: SidebarViewerCommand
): Promise<SidebarViewerResult> {
  return requestRendererCommand(
    window,
    'sidebarViewer',
    SidebarViewerParams.parse(command),
    SidebarViewerResultSchema,
    'renderer_timeout_applied_unknown'
  )
}
