import {
  WorkspaceFilterParams,
  type ProjectFilterControl,
  type WorkspaceFilterCommand
} from '../../shared/rpc-contract/workspace-filter-params'
import { WorkspaceFilterResultSchema } from '../../shared/workspace-filter-command'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getRequiredStringFlagAllowingEmpty } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

function handler(
  operation: WorkspaceFilterCommand['operation'],
  action?: ProjectFilterControl['action']
): CommandHandler {
  return async ({ client, flags, json }) => {
    const viewer = getRequiredStringFlag(flags, 'viewer')
    let control: unknown
    if (operation === 'control') {
      const surface = getRequiredStringFlag(flags, 'surface')
      const state = action === 'menu' ? getRequiredStringFlag(flags, 'state') : undefined
      if (action === 'menu' && state !== 'open' && state !== 'closed') {
        throw new RuntimeClientError('invalid_argument', '--state requires open or closed')
      }
      control = {
        surface,
        action,
        ...(action === 'menu' ? { open: state === 'open' } : {}),
        ...(action === 'search'
          ? { query: getRequiredStringFlagAllowingEmpty(flags, 'query') }
          : {}),
        ...(action === 'highlight' ? { repoId: getRequiredStringFlag(flags, 'repo') } : {})
      }
    }
    let filters: unknown
    if (operation === 'set') {
      try {
        filters = JSON.parse(getRequiredStringFlag(flags, 'filters'))
      } catch {
        throw new RuntimeClientError('invalid_argument', '--filters requires a JSON object')
      }
    }
    const parsed = WorkspaceFilterParams.safeParse({
      viewer,
      operation,
      ...(operation === 'select-project' || operation === 'remove-last-project'
        ? { surface: getRequiredStringFlag(flags, 'surface') }
        : {}),
      ...(operation === 'control' ? { control } : {}),
      ...(operation === 'set' ? { filters } : {}),
      ...(operation === 'remove-project' ||
      operation === 'toggle-project' ||
      operation === 'select-project'
        ? { repoId: getRequiredStringFlag(flags, 'repo') }
        : {})
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --viewer host and valid workspace filter fields'
      )
    }
    try {
      const response = await client.call('ui.workspaceFilter', parsed.data)
      const result = WorkspaceFilterResultSchema.parse(response.result)
      printResult({ ...response, result }, json, (value) => JSON.stringify(value))
    } catch (error) {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support viewer workspace filters. Update the target runtime.'
        )
      }
      throw error
    }
  }
}

export const WORKSPACE_FILTER_HANDLERS: Record<string, CommandHandler> = {
  'ui project-filter select': handler('select-project'),
  'ui project-filter remove-last': handler('remove-last-project'),
  'ui workspace-filter menu': handler('control', 'menu'),
  'ui project-filter search': handler('control', 'search'),
  'ui project-filter highlight': handler('control', 'highlight'),
  'ui project-filter focus': handler('control', 'focus'),
  'ui workspace-filter get': handler('get'),
  'ui workspace-filter set': handler('set'),
  'ui workspace-filter reset': handler('reset'),
  'ui project-filter remove': handler('remove-project'),
  'ui project-filter toggle': handler('toggle-project')
}
