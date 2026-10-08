import type {
  BrowserImportHintCommand,
  BrowserImportHintState
} from '../../../shared/rpc-contract/browser-import-hint-params'
import { useAppStore } from '@/store'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { findPage } from '@/store/slices/browser-page-records'
import {
  getBrowserSettingsHostId,
  getBrowserSessionProfileHostId
} from '@/store/slices/browser/browser-host-state'
import { requestBrowserImportHint } from './browser-import-hint-request'
export function requireBrowserImportHintIdentity(command: BrowserImportHintCommand): void {
  const state = useAppStore.getState()
  const page = findPage(state.browserPagesByWorkspace, command.pageId)
  const tab = page
    ? state.browserTabsByWorktree[page.worktreeId]?.find((entry) => entry.id === page.workspaceId)
    : undefined
  if (isPairedWebClientWindow() || !state.persistedUIReady || !state.settings) {
    throw new Error('browser_import_hint_viewer_unavailable')
  }
  if (
    !page ||
    !tab ||
    state.activeWorktreeId !== page.worktreeId ||
    tab.activePageId !== page.id ||
    (tab.sessionProfileId ?? 'default') !== command.profileId
  ) {
    throw new Error('browser_import_hint_target_mismatch')
  }
  if (
    getBrowserSettingsHostId(state) !== command.hostId ||
    getBrowserSessionProfileHostId(state, page.worktreeId, page.browserRuntimeEnvironmentId) !==
      command.hostId
  ) {
    throw new Error('browser_import_hint_host_mismatch')
  }
}
export function requireBrowserImportHint(command: BrowserImportHintCommand): void {
  requireBrowserImportHintIdentity(command)
  const state = useAppStore.getState()
  if (
    state.browserImportHintHidden ||
    state.activeModal !== 'none' ||
    state.activeView !== 'terminal'
  ) {
    throw new Error('browser_import_hint_surface_inactive')
  }
}
export async function applyBrowserImportHintAction(
  command: BrowserImportHintCommand,
  expiresAt: number
): Promise<BrowserImportHintState> {
  requireBrowserImportHint(command)
  return requestBrowserImportHint(command, expiresAt)
}
