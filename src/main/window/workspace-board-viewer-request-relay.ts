import {
  WorkspaceBoardParams,
  type WorkspaceBoardCommand
} from '../../shared/rpc-contract/workspace-board-params'
import {
  WorkspaceBoardResultSchema,
  type WorkspaceBoardResult
} from '../../shared/workspace-board-command'
import {
  requestRendererCommand,
  type RendererCommandWindow
} from './renderer-command-request-relay'

export function requestWorkspaceBoardFromRenderer(
  window: RendererCommandWindow,
  command: WorkspaceBoardCommand
): Promise<WorkspaceBoardResult> {
  return requestRendererCommand(
    window,
    'workspaceBoardViewer',
    WorkspaceBoardParams.parse(command),
    WorkspaceBoardResultSchema,
    'renderer_timeout_persistence_unknown'
  )
}
