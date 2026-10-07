import { BrowserViewerCommand } from '../../../../shared/rpc-contract/browser-viewer-params'
import { defineMethod } from '../core'

export const BROWSER_VIEWER_METHODS = [
  defineMethod({
    name: 'ui.browserViewer',
    params: BrowserViewerCommand,
    handler: (params, { runtime }) => runtime.browserViewer(params)
  })
]
