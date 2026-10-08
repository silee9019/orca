import { ipcMain } from 'electron'
import type { Store } from './persistence'
import { previewGhosttyImport } from './ghostty'
import { previewWarpThemeImport } from './warp-themes'
import { setDesktopImportPreviewsForRpc } from './runtime/rpc/methods/workspace-import-previews'

export function registerSettingsImportPreviewHandlers(store: Store): void {
  ipcMain.handle('settings:previewGhosttyImport', () => previewGhosttyImport(store))
  ipcMain.handle('settings:previewWarpThemeImport', (event, args?: unknown) => {
    const source = args === undefined ? { kind: 'auto' } : args
    return previewWarpThemeImport(store, source, event.sender)
  })
  setDesktopImportPreviewsForRpc({
    ghostty: () => previewGhosttyImport(store),
    warpAuto: () => previewWarpThemeImport(store, { kind: 'auto' })
  })
}
