import { WorkspaceBoardParams } from '../../shared/rpc-contract/workspace-board-params'
import { WorkspaceBoardResultSchema } from '../../shared/workspace-board-command'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

type Operation =
  | 'get'
  | 'status-add'
  | 'status-rename'
  | 'status-color'
  | 'status-icon'
  | 'status-move'
  | 'status-remove'
  | 'column-width'

const OPERATION_FLAGS: Record<Operation, Record<string, string>> = {
  get: {},
  'status-add': {},
  'status-rename': { statusId: 'status', label: 'label' },
  'status-color': { statusId: 'status', color: 'color' },
  'status-icon': { statusId: 'status', icon: 'icon' },
  'status-move': { statusId: 'status', direction: 'direction' },
  'status-remove': { statusId: 'status' },
  'column-width': { width: 'width' }
}

function handler(operation: Operation): CommandHandler {
  return async ({ client, flags, json }) => {
    const fields = Object.fromEntries(
      Object.entries(OPERATION_FLAGS[operation]).map(([field, flag]) => {
        const value = getRequiredStringFlag(flags, flag)
        return [field, field === 'width' ? Number(value) : value]
      })
    )
    const parsed = WorkspaceBoardParams.safeParse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation,
      ...fields
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --viewer host with a non-empty label, a listed color or icon, left or right, or a width of 220-520.'
      )
    }
    try {
      const response = await client.call('ui.workspaceBoardViewer', parsed.data)
      const result = WorkspaceBoardResultSchema.parse(response.result)
      printResult({ ...response, result }, json, (value) => JSON.stringify(value))
    } catch (error) {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'Update the target runtime to use workspace board commands.'
        )
      }
      throw error
    }
  }
}
export const WORKSPACE_BOARD_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'ui workspace-board get': handler('get'),
  'ui workspace-board status-add': handler('status-add'),
  'ui workspace-board status-rename': handler('status-rename'),
  'ui workspace-board status-color': handler('status-color'),
  'ui workspace-board status-icon': handler('status-icon'),
  'ui workspace-board status-move': handler('status-move'),
  'ui workspace-board status-remove': handler('status-remove'),
  'ui workspace-board column-width': handler('column-width')
}
