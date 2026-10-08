import { BrowserWindow, ipcMain, shell } from 'electron'
import type { KeybindingActionId, KeybindingFileSnapshot } from '../../shared/keybindings'
import type { KeybindingService } from '../keybindings/keybinding-service'
import { createKeybindingFileOperations } from '../keybindings/keybinding-file-operations'
import { rebuildAppMenu } from '../menu/register-app-menu'

export function broadcastKeybindingsChanged(snapshot: KeybindingFileSnapshot): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('keybindings:changed', snapshot)
    }
  }
  rebuildAppMenu()
}

export function registerKeybindingHandlers(
  service: KeybindingService,
  onChanged?: () => void
): void {
  const files = createKeybindingFileOperations(service, {
    onChanged: (snapshot) => {
      broadcastKeybindingsChanged(snapshot)
      onChanged?.()
    },
    openPath: (path) => shell.openPath(path),
    showItemInFolder: (path) => shell.showItemInFolder(path)
  })
  ipcMain.handle('keybindings:get', () => service.getSnapshot())

  ipcMain.handle('keybindings:ensureFile', () => files.ensureFile())

  ipcMain.handle(
    'keybindings:setAction',
    (_event, args: { actionId: KeybindingActionId; bindings: string[] | null }) => {
      const snapshot = service.setActionBindings(args.actionId, args.bindings)
      broadcastKeybindingsChanged(snapshot)
      onChanged?.()
      return snapshot
    }
  )

  ipcMain.handle('keybindings:reload', () => {
    const snapshot = service.reload()
    broadcastKeybindingsChanged(snapshot)
    onChanged?.()
    return snapshot
  })

  ipcMain.handle('keybindings:openFile', () => files.openFile())
  ipcMain.handle('keybindings:revealFile', () => files.revealFile())
}
