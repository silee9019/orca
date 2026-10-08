import { isAbsolute } from 'node:path'
import type { z } from 'zod'
import type { BrowserCookieImportResult } from '../../../../shared/browser-workspace-types'
import { BrowserProfileImportFile } from '../../../../shared/rpc-contract/browser-profile-file-params'
import { defineMethod } from '../core'

export async function importBrowserProfileCookieFile(
  params: z.infer<typeof BrowserProfileImportFile>
): Promise<BrowserCookieImportResult> {
  if (!isAbsolute(params.filePath)) {
    return { ok: false, reason: 'Cookie file path must be absolute on the selected runtime host.' }
  }
  const { browserSessionRegistry } = await import('../../../browser/browser-session-registry')
  const profile = browserSessionRegistry.getProfile(params.profileId)
  if (!profile) {
    return { ok: false, reason: 'Session profile not found.' }
  }
  const { importCookiesFromFile } = await import('../../../browser/browser-cookie-import')
  const result = await importCookiesFromFile(params.filePath, profile.partition)
  if (!result.ok) {
    return result
  }
  browserSessionRegistry.updateProfileSource(params.profileId, {
    browserFamily: 'manual',
    importedAt: Date.now()
  })
  return { ...result, profileId: params.profileId }
}

export const BROWSER_PROFILE_FILE_METHODS = [
  defineMethod({
    name: 'browser.profileImportFile',
    params: BrowserProfileImportFile,
    handler: importBrowserProfileCookieFile
  })
]
