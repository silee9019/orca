import type { RefObject } from 'react'
import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import type { BrowserToolbarEvent } from '@/runtime/browser-toolbar-request'
import { readBrowserClientPageGuestMetadataIfLive } from '../browser-client-page-guest-metadata'
export type BrowserNativeHistoryOwner = {
  workspaceId: string
  worktreeId: string
  isActive: boolean
  webviewRef: RefObject<Electron.WebviewTag | null>
}
export function performBrowserNativeShortcutHistory(
  request: BrowserToolbarEvent,
  owner: BrowserNativeHistoryOwner | undefined,
  isMounted: () => boolean
): void {
  const guest = owner?.webviewRef.current
  if (!owner || !guest || !readBrowserClientPageGuestMetadataIfLive(guest)) {
    throw new Error('browser_guest_unavailable')
  }
  const host = getExecutionHostIdForWorktree(useAppStore.getState(), owner.worktreeId)
  const current = (): boolean => {
    const state = useAppStore.getState()
    const page = findPage(state.browserPagesByWorkspace, request.page)
    const group = state.groupsByWorktree[owner.worktreeId]?.find(
      (entry) => entry.id === state.activeGroupIdByWorktree[owner.worktreeId]
    )
    const tab = state.unifiedTabsByWorktree[owner.worktreeId]?.find(
      (entry) => entry.id === group?.activeTabId
    )
    return Boolean(
      isMounted() &&
      owner.isActive &&
      owner.webviewRef.current === guest &&
      state.persistedUIReady &&
      state.settings &&
      !state.settings.activeRuntimeEnvironmentId &&
      state.activeView === 'terminal' &&
      state.activeModal === 'none' &&
      state.activeWorktreeId === owner.worktreeId &&
      tab?.contentType === 'browser' &&
      tab.entityId === owner.workspaceId &&
      getExecutionHostIdForWorktree(state, owner.worktreeId) === host &&
      page &&
      page.worktreeId === owner.worktreeId &&
      page.workspaceId === owner.workspaceId &&
      !page.docLocation &&
      !page.browserRuntimeEnvironmentId &&
      !state.remoteBrowserPageHandlesByPageId[request.page] &&
      state.browserTabsByWorktree[owner.worktreeId]?.some(
        (workspace) => workspace.id === owner.workspaceId && workspace.activePageId === request.page
      )
    )
  }
  let invalidated = false
  const check = (): void => {
    if (invalidated || !current()) {
      throw new Error('browser_shortcut_history_owner_changed')
    }
    if (Date.now() >= request.expiresAt) {
      throw new Error('request_expired')
    }
  }
  check()
  const unsubscribe = useAppStore.subscribe(() => {
    if (!current()) {
      invalidated = true
    }
  })
  try {
    const back = request.action === 'back-shortcut'
    if (!(back ? guest.canGoBack() : guest.canGoForward())) {
      throw new Error('browser_history_unavailable')
    }
    check()
    if (back) {
      guest.goBack()
    } else {
      guest.goForward()
    }
    check()
    request.finish(undefined, { action: request.action })
  } finally {
    unsubscribe()
  }
}
