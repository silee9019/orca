import { ExtensionsSidebarParams } from '../../../../shared/extensions-sidebar-command'
import { requestAccountViewerAction } from '../../account-viewer-request'
import { defineMethod } from '../core'

export const EXTENSIONS_SIDEBAR_METHODS = [
  defineMethod({
    name: 'extensions.sidebarAction',
    params: ExtensionsSidebarParams,
    handler: ({ action }, { signal }) =>
      requestAccountViewerAction({ domain: 'extensions-sidebar', action }, signal)
  })
]
