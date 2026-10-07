import { defineMethod } from '../core'
import {
  DesktopUpdateBuildsParams,
  DesktopUpdateCheckParams
} from '../../../../shared/rpc-contract/app-lifecycle-params'
import { AppLifecycleInstallParams } from '../../../../shared/app-lifecycle-control'
import { assertDesktopAppContext, assertDesktopAppTarget } from './desktop-app-target'

export const DESKTOP_UPDATER_METHODS = [
  defineMethod({
    name: 'desktopUpdater.getStatus',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../updater')).getUpdateStatus()
    }
  }),
  defineMethod({
    name: 'desktopUpdater.getVersion',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      return (await import('electron')).app.getVersion()
    }
  }),
  defineMethod({
    name: 'desktopUpdater.check',
    params: DesktopUpdateCheckParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      const { ensureAutoUpdaterConfigured } = await import('../../../window/main-window-updater')
      const updater = await import('../../../updater')
      ensureAutoUpdaterConfigured()
      updater.checkForUpdatesFromMenu(params)
      return updater.getUpdateStatus()
    }
  }),
  defineMethod({
    name: 'desktopUpdater.download',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      const updater = await import('../../../updater')
      updater.downloadUpdate()
      return updater.getUpdateStatus()
    }
  }),
  defineMethod({
    name: 'desktopUpdater.install',
    params: AppLifecycleInstallParams,
    handler: async (params, context) => {
      assertDesktopAppTarget(context, params.confirmTarget)
      return (await import('../../../window/app-lifecycle-control')).requestAppControl(
        { ...params, action: 'install-update' },
        context
      )
    }
  }),
  defineMethod({
    name: 'desktopUpdater.dismissNudge',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      const updater = await import('../../../updater')
      updater.dismissNudge()
      return updater.getUpdateStatus()
    }
  }),
  defineMethod({
    name: 'desktopUpdater.dismissAvailableUpdate',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      const updater = await import('../../../updater')
      updater.dismissAvailableUpdate()
      return updater.getUpdateStatus()
    }
  }),
  defineMethod({
    name: 'desktopUpdater.getLinuxPackageInstallInstructions',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../updater')).getLinuxPackageInstallInstructions()
    }
  }),
  defineMethod({
    name: 'desktopUpdater.showLinuxPackage',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      await (await import('../../../updater')).showLinuxPackage()
      return { state: 'revealed' as const }
    }
  }),
  defineMethod({
    name: 'desktopUpdater.listBuilds',
    params: DesktopUpdateBuildsParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      return {
        channel: params.channel,
        builds: await (
          await import('../../../updater')
        ).listAvailableReleaseBuilds(params.channel, { force: params.force === true })
      }
    }
  })
]
