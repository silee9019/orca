import { defineMethod } from '../core'
import {
  DesktopCliDistroParams,
  DesktopCliMutationParams
} from '../../../../shared/rpc-contract/app-lifecycle-params'
import { assertDesktopAppContext, assertDesktopAppTarget } from './desktop-app-target'

export const DESKTOP_CLI_METHODS = [
  defineMethod({
    name: 'desktopCli.getInstallStatus',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../ipc/cli')).getCliInstallOperations().getInstallStatus()
    }
  }),
  defineMethod({
    name: 'desktopCli.getWslInstallStatus',
    params: DesktopCliDistroParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../ipc/cli'))
        .getCliInstallOperations()
        .getWslInstallStatus(params)
    }
  }),
  defineMethod({
    name: 'desktopCli.install',
    params: DesktopCliMutationParams,
    handler: async (params, context) => {
      assertDesktopAppTarget(context, params.confirmTarget)
      const operations = (await import('../../../ipc/cli')).getCliInstallOperations()
      assertDesktopAppTarget(context, params.confirmTarget)
      return params.distro ? operations.installWsl({ distro: params.distro }) : operations.install()
    }
  }),
  defineMethod({
    name: 'desktopCli.remove',
    params: DesktopCliMutationParams,
    handler: async (params, context) => {
      assertDesktopAppTarget(context, params.confirmTarget)
      const operations = (await import('../../../ipc/cli')).getCliInstallOperations()
      assertDesktopAppTarget(context, params.confirmTarget)
      return params.distro ? operations.removeWsl({ distro: params.distro }) : operations.remove()
    }
  })
]
