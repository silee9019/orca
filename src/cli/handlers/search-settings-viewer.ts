import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import {
  SearchSettingsViewerParams,
  SearchSettingsViewerResultSchema
} from '../../shared/search-settings-viewer'

export const SEARCH_SETTINGS_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'search viewer': async ({ client, flags, json }) => {
    const command = SearchSettingsViewerParams.parse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation: getRequiredStringFlag(flags, 'operation'),
      executionHostId: getOptionalStringFlag(flags, 'target-host'),
      confirmation: getOptionalStringFlag(flags, 'confirm')
    })
    const response = await client.call('search.viewer', command)
    const result = SearchSettingsViewerResultSchema.parse(response.result)
    if (!result.applied) {
      throw new Error('search_settings_not_applied')
    }
    if (['local-toggle', 'server-toggle'].includes(command.operation) && !result.persisted) {
      throw new Error('search_settings_persistence_unknown')
    }
    printResult({ ...response, result }, json, (value) => JSON.stringify(value, null, 2))
  }
}
