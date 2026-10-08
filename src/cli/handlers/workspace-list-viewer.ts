import { WorkspaceListViewerParams } from '../../shared/rpc-contract/workspace-list-viewer-params'
import { WorkspaceListViewerResultSchema } from '../../shared/workspace-list-viewer-command'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

function handler(operation: 'get' | 'group' | 'sort' | 'project-order'): CommandHandler {
  return async ({ client, flags, json }) => {
    const parsed = WorkspaceListViewerParams.safeParse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation,
      ...(operation !== 'get' ? { by: getRequiredStringFlag(flags, 'by') } : {})
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --viewer host and a supported workspace list mode.'
      )
    }
    try {
      const response = await client.call('ui.workspaceListViewer', parsed.data)
      const result = WorkspaceListViewerResultSchema.parse(response.result)
      printResult({ ...response, result }, json, (value) => JSON.stringify(value))
    } catch (error) {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'Update the target runtime to use workspace list commands.'
        )
      }
      throw error
    }
  }
}
export const WORKSPACE_LIST_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'ui workspace-list get': handler('get'),
  'ui workspace-list group': handler('group'),
  'ui workspace-list sort': handler('sort'),
  'ui workspace-list project-order': handler('project-order')
}
