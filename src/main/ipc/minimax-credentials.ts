import { ipcMain } from 'electron'
import { createMiniMaxCredentialActions } from '../minimax/minimax-credential-actions'
import type { RateLimitService } from '../rate-limits/service'

export function registerMiniMaxCredentialsHandlers(rateLimits: RateLimitService | null): void {
  const actions = createMiniMaxCredentialActions(rateLimits)
  ipcMain.handle('minimaxCredentials:getStatus', actions.getStatus)
  ipcMain.handle('minimaxCredentials:saveCookie', (_event, cookie: string) =>
    actions.saveCookie(cookie)
  )
  ipcMain.handle('minimaxCredentials:clearCookie', actions.clearCookie)
  ipcMain.handle('minimaxCredentials:saveApiKey', (_event, key: string) => actions.saveApiKey(key))
  ipcMain.handle('minimaxCredentials:clearApiKey', actions.clearApiKey)
}
