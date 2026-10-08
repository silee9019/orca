import type { WebRuntimeBrowserCreationObserver } from '@/runtime/web-runtime-browser-creation-receipt'
import { useAppStore } from '@/store'
import { createWorkspaceBrowserShortcut } from '@/components/workspace-browser-shortcut-creation'
import {
  createFloatingWorkspaceBrowserTab,
  isFloatingWorkspacePanelFocused
} from '@/lib/floating-workspace-terminal-actions'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import type { AppState } from '@/store/types'
export function resolveBrowserNewTabInvocation(state: AppState) {
  const floating = isFloatingWorkspacePanelFocused()
  const worktree = floating ? FLOATING_TERMINAL_WORKTREE_ID : state.activeWorktreeId
  const group = worktree
    ? (state.activeGroupIdByWorktree[worktree] ?? state.groupsByWorktree[worktree]?.[0]?.id)
    : undefined
  return { worktree, group, floating }
}
export async function createBrowserTabForCurrentViewer(options?: {
  workspaceFallback: boolean
  onCreationReceipt?: WebRuntimeBrowserCreationObserver
}): Promise<void> {
  const store = useAppStore.getState()
  if (isFloatingWorkspacePanelFocused()) {
    await createFloatingWorkspaceBrowserTab(store)
    return
  }
  const worktreeId = store.activeWorktreeId
  if (!worktreeId) {
    return
  }
  const group =
    store.activeGroupIdByWorktree[worktreeId] ?? store.groupsByWorktree[worktreeId]?.[0]?.id
  if (!group && !options?.workspaceFallback) {
    return
  }
  await createWorkspaceBrowserShortcut({
    worktreeId,
    ...(options?.onCreationReceipt ? { onCreationReceipt: options.onCreationReceipt } : {}),
    createBrowserTab: store.createBrowserTab,
    openNewBrowserTabInActiveWorkspace: store.openNewBrowserTabInActiveWorkspace
  })
}
