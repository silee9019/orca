import {
  WorkspaceListViewerParams,
  type WorkspaceListViewerCommand
} from '../../shared/rpc-contract/workspace-list-viewer-params'
import {
  WorkspaceListViewerResultSchema,
  type WorkspaceListViewerResult
} from '../../shared/workspace-list-viewer-command'
import {
  requestRendererCommand,
  type RendererCommandWindow
} from './renderer-command-request-relay'

export function requestWorkspaceListViewerFromRenderer(
  window: RendererCommandWindow,
  command: WorkspaceListViewerCommand
): Promise<WorkspaceListViewerResult> {
  return requestRendererCommand(
    window,
    'workspaceListViewer',
    WorkspaceListViewerParams.parse(command),
    WorkspaceListViewerResultSchema,
    'renderer_timeout_persistence_unknown'
  )
}
