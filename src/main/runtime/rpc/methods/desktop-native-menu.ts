import { DesktopNativeMenuParams } from '../../../../shared/app-surface-control'
import { defineMethod } from '../core'
import { assertDesktopAppTarget } from './desktop-app-target'

export const DESKTOP_NATIVE_MENU_METHODS = [
  defineMethod({
    name: 'app.nativeMenu',
    params: DesktopNativeMenuParams,
    handler: async (params, context) => {
      assertDesktopAppTarget(context, params.confirmTarget)
      const { app, Menu } = await import('electron')
      if (params.action === 'status') {
        return {
          platform: process.platform,
          hidden: process.platform === 'darwin' ? app.isHidden() : null,
          nativeServices: process.platform === 'darwin' ? 'human-required' : 'unsupported'
        }
      }
      if (params.action === 'about') {
        app.showAboutPanel()
      } else {
        if (process.platform !== 'darwin') {
          throw new Error('This native menu role is supported on macOS only')
        }
        switch (params.action) {
          case 'hide':
            app.hide()
            break
          case 'hide-others':
            Menu.sendActionToFirstResponder('hideOtherApplications:')
            break
          case 'unhide':
            Menu.sendActionToFirstResponder('unhideAllApplications:')
            break
          case 'services':
            return {
              state: 'human-required',
              platform: process.platform,
              target: params.confirmTarget,
              instruction:
                'Choose the native Services entry in this app menu. macOS supplies selection-dependent services; no service was invoked. Cancel by closing the native menu.'
            }
        }
      }
      return {
        state: 'requested',
        target: params.confirmTarget,
        action: params.action,
        completed: false
      }
    }
  })
]
