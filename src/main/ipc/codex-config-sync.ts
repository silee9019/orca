import { ipcMain } from 'electron'
import {
  readCodexConfigSyncStatus,
  type CodexMirroredHomeResolver
} from '../codex/config-sync-status-read'

export function registerCodexConfigSyncHandlers(runtimeHome: CodexMirroredHomeResolver): void {
  ipcMain.removeHandler('codexConfigSync:status')
  ipcMain.handle('codexConfigSync:status', () => readCodexConfigSyncStatus(runtimeHome))
}
