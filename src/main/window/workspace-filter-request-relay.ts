import {
  WorkspaceFilterParams,
  type WorkspaceFilterCommand
} from '../../shared/rpc-contract/workspace-filter-params'
import {
  WorkspaceFilterResultSchema,
  type WorkspaceFilterResult
} from '../../shared/workspace-filter-command'
import {
  requestRendererCommand,
  type RendererCommandWindow
} from './renderer-command-request-relay'

export function requestWorkspaceFilterFromRenderer(
  window: RendererCommandWindow,
  command: WorkspaceFilterCommand
): Promise<WorkspaceFilterResult> {
  return requestRendererCommand(
    window,
    'workspaceFilter',
    WorkspaceFilterParams.parse(command),
    WorkspaceFilterResultSchema,
    'renderer_timeout_persistence_unknown'
  )
}
