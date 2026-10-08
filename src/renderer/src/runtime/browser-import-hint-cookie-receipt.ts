import type { BrowserCookieImportResult } from '../../../shared/browser-workspace-types'
import type {
  BrowserImportHintCommand,
  BrowserImportHintState
} from '../../../shared/rpc-contract/browser-import-hint-params'
import { useAppStore } from '@/store'
export async function completeBrowserImportHintCookie(
  command: BrowserImportHintCommand,
  perform: () => Promise<BrowserCookieImportResult>,
  requireFeaturePersistence: boolean
): Promise<NonNullable<BrowserImportHintState['imported']>> {
  if (command.confirmProfile !== command.profileId) {
    throw new Error('browser_import_hint_profile_confirmation_required')
  }
  const previous =
    useAppStore.getState().featureInteractions['cookie-import']?.interactionCount ?? 0
  const result = await perform()
  if (!result.ok || (result.profileId !== undefined && result.profileId !== command.profileId)) {
    throw new Error('browser_import_hint_cookie_import_failed')
  }
  const state = useAppStore.getState()
  const imported = state.browserSessionImportState
  const persisted = requireFeaturePersistence ? await window.api.ui.get() : undefined
  if (
    imported?.profileId !== command.profileId ||
    imported.status !== 'success' ||
    imported.summary?.importedCookies !== result.summary.importedCookies ||
    imported.summary.totalCookies !== result.summary.totalCookies ||
    imported.summary.skippedCookies !== result.summary.skippedCookies ||
    (requireFeaturePersistence &&
      (persisted?.featureInteractions?.['cookie-import']?.interactionCount ?? 0) <
        Math.max(
          previous + 1,
          useAppStore.getState().featureInteractions['cookie-import']?.interactionCount ?? 0
        ))
  ) {
    throw new Error('browser_import_hint_cookie_readback_failed')
  }
  return {
    totalCookies: result.summary.totalCookies,
    importedCookies: result.summary.importedCookies,
    skippedCookies: result.summary.skippedCookies
  }
}
