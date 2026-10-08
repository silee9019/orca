import { SettingsViewerParams } from '../../shared/rpc-contract/settings-viewer-params'
import { SettingsViewerResultSchema } from '../../shared/settings-viewer-command'
import type { CommandHandler } from '../dispatch'
import {
  getOptionalStringFlag,
  getRequiredStringFlag,
  getRequiredStringFlagAllowingEmpty
} from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

function handler(operation: 'open' | 'search'): CommandHandler {
  return async ({ client, flags, json }) => {
    const parsed = SettingsViewerParams.safeParse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation,
      ...(operation === 'open'
        ? {
            pane: getRequiredStringFlag(flags, 'pane'),
            repoId: getOptionalStringFlag(flags, 'repo'),
            hostId: getOptionalStringFlag(flags, 'project-host'),
            sectionId: getOptionalStringFlag(flags, 'section')
          }
        : { query: getRequiredStringFlagAllowingEmpty(flags, 'query') })
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --viewer host and an explicit settings pane or query; repository panes require --repo.'
      )
    }
    try {
      const response = await client.call('ui.settingsViewer', parsed.data)
      const result = SettingsViewerResultSchema.parse(response.result)
      printResult({ ...response, result }, json, (value) => JSON.stringify(value))
    } catch (error) {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support viewer settings navigation. Update the target runtime.'
        )
      }
      throw error
    }
  }
}
export const SETTINGS_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'ui settings open': handler('open'),
  'ui settings search': handler('search')
}
