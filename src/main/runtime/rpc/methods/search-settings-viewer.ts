import { defineMethod } from '../core'
import { SearchSettingsViewerParams } from '../../../../shared/search-settings-viewer'

export const SEARCH_SETTINGS_VIEWER_METHODS = [
  defineMethod({
    name: 'search.viewer',
    params: SearchSettingsViewerParams,
    handler: (params, { runtime }) => runtime.searchSettingsViewer(params)
  })
]
