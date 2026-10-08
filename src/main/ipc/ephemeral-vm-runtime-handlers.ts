import { app, ipcMain } from 'electron'
import type { Store } from '../persistence'
import { EphemeralVmRuntimeOperations } from '../ephemeral-vm-runtime-operations'
export type { EphemeralVmCleanupCommandResult } from '../ephemeral-vm-runtime-operations'

export function registerEphemeralVmRuntimeHandlers(
  store: Store,
  operations = new EphemeralVmRuntimeOperations(store, app.getPath('userData'))
): void {
  ipcMain.removeHandler('ephemeralVm:listRuntimes')
  ipcMain.handle('ephemeralVm:listRuntimes', () => operations.listRuntimes())
  ipcMain.removeHandler('ephemeralVm:attachWorkspace')
  ipcMain.handle(
    'ephemeralVm:attachWorkspace',
    (_event, args: { runtimeId: string; workspaceId: string }) => operations.attachWorkspace(args)
  )
  ipcMain.removeHandler('ephemeralVm:cleanup')
  ipcMain.handle('ephemeralVm:cleanup', (_event, args: { runtimeId: string }) =>
    operations.cleanup(args)
  )
  ipcMain.removeHandler('ephemeralVm:stopCleanup')
  ipcMain.handle('ephemeralVm:stopCleanup', (_event, args: { runtimeId: string }) =>
    operations.stopCleanup(args)
  )
  ipcMain.removeHandler('ephemeralVm:suspendWorkspace')
  ipcMain.handle('ephemeralVm:suspendWorkspace', (_event, args: { workspaceId: string }) =>
    operations.suspendWorkspace(args)
  )
  ipcMain.removeHandler('ephemeralVm:resumeWorkspace')
  ipcMain.handle('ephemeralVm:resumeWorkspace', (_event, args: { workspaceId: string }) =>
    operations.resumeWorkspace(args)
  )
  ipcMain.removeHandler('ephemeralVm:getCleanupCommand')
  ipcMain.handle('ephemeralVm:getCleanupCommand', (_event, args: { runtimeId: string }) =>
    operations.getCleanupCommand(args)
  )
}
