import type { BrowserCookieImportResult } from '../../../shared/browser-workspace-types'
import type {
  BrowserImportHintCommand,
  BrowserImportHintState
} from '../../../shared/rpc-contract/browser-import-hint-params'
import { completeBrowserImportHintCookie } from './browser-import-hint-cookie-receipt'
export async function completeBrowserImportHintFile(
  command: BrowserImportHintCommand,
  importFile: (filePath: string) => Promise<BrowserCookieImportResult>
): Promise<NonNullable<BrowserImportHintState['imported']>> {
  if (
    command.hostId !== 'local' ||
    !command.filePath ||
    command.confirmProfile !== command.profileId
  ) {
    throw new Error('browser_import_hint_file_confirmation_required')
  }
  const filePath = command.filePath
  return completeBrowserImportHintCookie(command, () => importFile(filePath), true)
}
