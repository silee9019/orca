import { DESKTOP_NATIVE_MENU_METHODS } from './desktop-native-menu'
import { AppSurfaceControlParams } from '../../../../shared/app-surface-control'
import { DesktopDockBadgeParams } from '../../../../shared/rpc-contract/app-lifecycle-params'
import { arch, release } from 'node:os'
import { AppLifecycleControlParams } from '../../../../shared/app-lifecycle-control'
import { defineMethod } from '../core'
import { desktopAppTarget, assertDesktopAppContext } from './desktop-app-target'

export const APP_LIFECYCLE_METHODS = [
  ...DESKTOP_NATIVE_MENU_METHODS,
  defineMethod({
    name: 'app.surfaceControl',
    params: AppSurfaceControlParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../window/app-surface-control')).requestAppSurfaceControl(
        params,
        context
      )
    }
  }),
  defineMethod({
    name: 'app.featureWallAssets',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../ipc/app')).getFeatureWallAssetBaseUrl()
    }
  }),
  defineMethod({
    name: 'app.floatingMarkdownDirectory',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      return (
        await import('../../../ipc/floating-workspace-directory')
      ).ensureDefaultFloatingWorkspacePath()
    }
  }),
  defineMethod({
    name: 'app.keyboardInputSource',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../ipc/app')).getKeyboardInputSourceId()
    }
  }),
  defineMethod({
    name: 'app.keyboardLayout',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      return (
        await import('../../../ipc/macos-keyboard-layout-snapshot')
      ).readMacKeyboardLayoutSnapshot()
    }
  }),
  defineMethod({
    name: 'app.setDockBadge',
    params: DesktopDockBadgeParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      ;(await import('../../../dock/unread-badge')).setUnreadDockBadgeCount(params.count)
      return {
        state: process.platform === 'darwin' ? ('applied' as const) : ('unsupported' as const)
      }
    }
  }),

  defineMethod({
    name: 'app.control',
    params: AppLifecycleControlParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../window/app-lifecycle-control')).requestAppControl(
        params,
        context
      )
    }
  }),
  defineMethod({
    name: 'app.getStatus',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      const { app } = await import('electron')
      const { getDevInstanceIdentity } = await import('../../../startup/dev-instance-identity')
      const { listAppControlViewers } = await import('../../../window/app-lifecycle-control')
      return {
        viewers: listAppControlViewers(),
        target: desktopAppTarget(context),
        pid: process.pid,
        version: app.getVersion(),
        identity: getDevInstanceIdentity(!app.isPackaged)
      }
    }
  }),
  defineMethod({
    name: 'app.platform',
    params: null,
    handler: () => ({
      platform: process.platform,
      osRelease: release(),
      arch: arch(),
      shell: process.env.SHELL?.trim() || process.env.ComSpec?.trim() || '',
      displayServer:
        process.platform !== 'linux'
          ? null
          : process.env.WAYLAND_DISPLAY ||
              process.env.XDG_SESSION_TYPE?.toLowerCase() === 'wayland' ||
              process.env.ELECTRON_OZONE_PLATFORM_HINT?.toLowerCase() === 'wayland'
            ? 'wayland'
            : process.env.DISPLAY
              ? 'x11'
              : null
    })
  }),
  defineMethod({
    name: 'app.shellAvailability',
    params: null,
    handler: async () => {
      const { isWslAvailableAsync } = await import('../../../wsl-availability')
      const { isPwshAvailableAsync } = await import('../../../pwsh')
      const { isGitBashAvailable } = await import('../../../git-bash')
      const [wsl, pwsh] = await Promise.all([isWslAvailableAsync(), isPwshAvailableAsync()])
      return { wsl, pwsh, gitBash: isGitBashAvailable() }
    }
  }),
  defineMethod({
    name: 'app.wslDistros',
    params: null,
    handler: async () => (await import('../../../wsl')).listWslDistrosAsync()
  })
]
