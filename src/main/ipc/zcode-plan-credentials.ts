import { ipcMain } from 'electron'
import { createZcodePlanCredentialActions } from '../zcode/zcode-plan-credential-actions'
import type { RateLimitService } from '../rate-limits/service'

export function registerZcodePlanCredentialsHandlers(rateLimits: RateLimitService | null): void {
  const actions = createZcodePlanCredentialActions(rateLimits)
  ipcMain.handle('zcodePlanCredentials:getStatus', actions.getStatus)
  ipcMain.handle('zcodePlanCredentials:saveApiKey', (_event, key: string) =>
    actions.saveApiKey(key)
  )
  ipcMain.handle('zcodePlanCredentials:clearApiKey', actions.clearApiKey)
}
