import {
  ActivityViewerParams,
  type ActivityViewerCommand
} from '../../shared/rpc-contract/activity-viewer-params'
import { ActivityViewerResultSchema } from '../../shared/activity-viewer-command'
import type { CommandHandler } from '../dispatch'
import { getOptionalJsonFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
function handler(operation: ActivityViewerCommand['operation']): CommandHandler {
  return async ({ client, flags, json }) => {
    let paneKeys: unknown
    if (operation === 'read-toggle-many' || operation === 'clear-threads') {
      const raw = getOptionalJsonFlag(flags, 'panes')
      try {
        paneKeys = JSON.parse(raw ?? 'null')
      } catch {
        throw new RuntimeClientError(
          'invalid_argument',
          'Use --panes with a JSON array of pane keys.'
        )
      }
    }
    const enabled =
      operation === 'context-menu' ||
      operation === 'preview-review-menu' ||
      operation === 'preview-issue-menu' ||
      operation === 'preview' ||
      operation === 'compact' ||
      operation === 'children' ||
      operation === 'search-visible'
        ? getRequiredStringFlag(flags, 'enabled')
        : undefined
    if (enabled !== undefined && enabled !== 'true' && enabled !== 'false') {
      throw new RuntimeClientError('invalid_argument', 'Use --enabled true or false.')
    }
    const hidden = operation === 'origin' ? getRequiredStringFlag(flags, 'hidden') : undefined
    if (hidden !== undefined && hidden !== 'true' && hidden !== 'false') {
      throw new RuntimeClientError('invalid_argument', 'Use --hidden true or false.')
    }
    const query = flags.get('query')
    if (operation === 'search' && typeof query !== 'string') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --query with a string, including an empty string to clear it.'
      )
    }
    const parsed = ActivityViewerParams.safeParse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      surface: getRequiredStringFlag(flags, 'surface'),
      operation,
      ...(operation === 'context-menu' ||
      operation === 'preview-copy-issue-link' ||
      operation === 'preview-review-menu' ||
      operation === 'preview-issue-menu' ||
      operation === 'preview-edit' ||
      operation === 'preview-copy-path' ||
      operation === 'preview' ||
      operation === 'copy' ||
      operation === 'read-toggle' ||
      operation === 'clear-thread' ||
      operation === 'jump' ||
      operation === 'select'
        ? { paneKey: getRequiredStringFlag(flags, 'pane') }
        : {}),
      ...(operation === 'read-toggle-many' || operation === 'clear-threads' ? { paneKeys } : {}),
      ...(operation === 'search' ? { query } : {}),
      ...(operation === 'copy' ? { kind: getRequiredStringFlag(flags, 'kind') } : {}),
      ...(operation === 'preview-edit' ? { field: getRequiredStringFlag(flags, 'field') } : {}),
      ...(operation === 'scroll' ? { top: Number(getRequiredStringFlag(flags, 'top')) } : {}),
      ...(operation === 'resize' ? { width: Number(getRequiredStringFlag(flags, 'width')) } : {}),
      ...(operation === 'group-toggle'
        ? { groupKey: getRequiredStringFlag(flags, 'group-key') }
        : {}),
      ...(operation === 'origin'
        ? { kind: getRequiredStringFlag(flags, 'kind'), hidden: hidden === 'true' }
        : {}),
      ...(operation === 'host-toggle' ? { host: getRequiredStringFlag(flags, 'host') } : {}),
      ...(operation === 'group' ? { by: getRequiredStringFlag(flags, 'by') } : {}),
      ...(operation === 'read' ? { filter: getRequiredStringFlag(flags, 'filter') } : {}),
      ...(enabled !== undefined ? { enabled: enabled === 'true' } : {})
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use a supported Activity preference and explicit --viewer host --surface.'
      )
    }
    try {
      const response = await client.call('ui.activityViewer', parsed.data)
      const result = ActivityViewerResultSchema.parse(response.result)
      if (result.surface !== parsed.data.surface) {
        throw new Error('invalid_viewer_response')
      }
      printResult({ ...response, result }, json, (value) => JSON.stringify(value))
    } catch (error) {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'Update the target runtime to use Activity commands.'
        )
      }
      throw error
    }
  }
}
export const ACTIVITY_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'ui activity get': handler('get'),
  'ui activity context-menu': handler('context-menu'),
  'ui activity copy': handler('copy'),
  'ui activity preview-copy-issue-link': handler('preview-copy-issue-link'),
  'ui activity preview-copy-path': handler('preview-copy-path'),
  'ui activity preview': handler('preview'),
  'ui activity preview-edit': handler('preview-edit'),
  'ui activity preview-review-menu': handler('preview-review-menu'),
  'ui activity preview-issue-menu': handler('preview-issue-menu'),
  'ui activity close': handler('close'),
  'ui activity resize': handler('resize'),
  'ui activity scroll': handler('scroll'),
  'ui activity jump': handler('jump'),
  'ui activity select': handler('select'),
  'ui activity group-toggle': handler('group-toggle'),
  'ui activity mark-all-read': handler('mark-all-read'),
  'ui activity clear-completed': handler('clear-completed'),
  'ui activity clear-thread': handler('clear-thread'),
  'ui activity clear-threads': handler('clear-threads'),
  'ui activity read-toggle': handler('read-toggle'),
  'ui activity read-toggle-many': handler('read-toggle-many'),
  'ui activity origin': handler('origin'),
  'ui activity scope-reset': handler('scope-reset'),
  'ui activity host-toggle': handler('host-toggle'),
  'ui activity hosts-toggle-all': handler('hosts-toggle-all'),
  'ui activity group': handler('group'),
  'ui activity read': handler('read'),
  'ui activity compact': handler('compact'),
  'ui activity children': handler('children'),
  'ui activity search': handler('search'),
  'ui activity search-clear': handler('search-clear'),
  'ui activity search-visible': handler('search-visible')
}
