import { ipcMain } from 'electron'
import { createOpenCodeGoCredentialActions } from '../opencode/opencode-go-credential-actions'
import type { CredentialRateLimits } from '../opencode/opencode-go-credential-actions'

export function registerOpenCodeGoCredentialsHandlers(
  rateLimits: CredentialRateLimits | null
): void {
  const actions = createOpenCodeGoCredentialActions(rateLimits)
  ipcMain.handle('opencodeGoCredentials:getStatus', actions.getStatus)
  ipcMain.handle('opencodeGoCredentials:saveApiKey', (_event, key: unknown) =>
    actions.saveApiKey(key)
  )
  ipcMain.handle('opencodeGoCredentials:clearApiKey', actions.clearApiKey)
}
