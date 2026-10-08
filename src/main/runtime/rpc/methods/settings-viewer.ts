import { defineMethod } from '../core'
import { SettingsViewerParams } from '../../../../shared/rpc-contract/settings-viewer-params'

export const SETTINGS_VIEWER_METHODS = [
  defineMethod({
    name: 'ui.settingsViewer',
    params: SettingsViewerParams,
    handler: (params, { runtime }) => runtime.settingsViewer(params)
  })
]
