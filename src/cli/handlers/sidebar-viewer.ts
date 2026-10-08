import { SidebarViewerParams } from '../../shared/rpc-contract/sidebar-viewer-params'
import { SidebarViewerResultSchema } from '../../shared/sidebar-viewer-command'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
function handler(operation: 'get' | 'toggle' | 'open-panel'): CommandHandler {
  return async ({ client, flags, json }) => {
    const parsed = SidebarViewerParams.safeParse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation,
      ...(operation === 'toggle'
        ? { side: getRequiredStringFlag(flags, 'side') }
        : operation === 'open-panel'
          ? { panel: getRequiredStringFlag(flags, 'panel') }
          : {})
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --viewer host and an explicit supported sidebar or panel.'
      )
    }
    try {
      const response = await client.call('ui.sidebarViewer', parsed.data)
      const result = SidebarViewerResultSchema.parse(response.result)
      printResult({ ...response, result }, json, (value) => JSON.stringify(value))
    } catch (error) {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support viewer sidebar commands. Update the target runtime.'
        )
      }
      throw error
    }
  }
}
export const SIDEBAR_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'ui sidebar get': handler('get'),
  'ui sidebar toggle': handler('toggle'),
  'ui panel open': handler('open-panel')
}
