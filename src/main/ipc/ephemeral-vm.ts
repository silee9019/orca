import { app, ipcMain } from 'electron'
import type { Store } from '../persistence'
import type { PluginService } from '../plugins/plugin-service'
import { initializeEphemeralVmOperations } from '../ephemeral-vm-operations'
import { registerEphemeralVmRuntimeHandlers } from './ephemeral-vm-runtime-handlers'
export type { EphemeralVmProvisionIpcResult } from '../ephemeral-vm-operations'

export function registerEphemeralVmHandlers(store: Store, pluginService?: PluginService): void {
  const operations = initializeEphemeralVmOperations(store, app.getPath('userData'), pluginService)
  registerEphemeralVmRuntimeHandlers(store, operations)
  ipcMain.removeHandler('ephemeralVm:listRecipes')
  ipcMain.handle('ephemeralVm:listRecipes', (_event, args: { repoId: string }) =>
    operations.listRecipes(args)
  )
  ipcMain.removeHandler('ephemeralVm:listRecipeCatalog')
  ipcMain.handle('ephemeralVm:listRecipeCatalog', () => operations.listRecipeCatalog())
  ipcMain.removeHandler('ephemeralVm:doctor')
  ipcMain.handle('ephemeralVm:doctor', (_event, args: { repoId: string; recipeId: string }) =>
    operations.doctor(args)
  )
  ipcMain.removeHandler('ephemeralVm:provision')
  ipcMain.handle(
    'ephemeralVm:provision',
    (
      _event,
      args: {
        repoId: string
        recipeId: string
        workspaceName?: string
        projectId?: string
        workspaceId?: string
        branch?: string
        ref?: string
        provisionId?: string
      }
    ) =>
      operations.provision(args, (event) => _event.sender.send('ephemeralVm:provisionEvent', event))
  )
  ipcMain.removeHandler('ephemeralVm:cancelProvision')
  ipcMain.handle('ephemeralVm:cancelProvision', (_event, args: { provisionId: string }) =>
    operations.cancelProvision(args)
  )
}
