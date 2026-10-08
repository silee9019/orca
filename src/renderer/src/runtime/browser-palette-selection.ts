import { useAppStore } from '@/store'
import { getActivatableBrowserWorkspaceTab } from '@/lib/browser-workspace-tab-activation'
import {
  BrowserPaletteSelection,
  type BrowserPaletteState
} from '../../../shared/rpc-contract/browser-palette-params'
import { dispatchBrowserPaletteSelection } from './browser-palette-command'
import { requestBrowserPaletteFocus } from './browser-palette-focus-request'

function waitForPaletteCommit(expiresAt: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame = 0
    const timer = setTimeout(
      () => {
        cancelAnimationFrame(frame)
        reject(new Error('browser_palette_timeout_effect_unknown'))
      },
      Math.max(0, expiresAt - Date.now())
    )
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  })
}

export async function applyBrowserPaletteSelection(
  raw: BrowserPaletteSelection,
  expiresAt: number
): Promise<BrowserPaletteState> {
  const target = BrowserPaletteSelection.parse(raw)
  const initial = useAppStore.getState()
  const tab = getActivatableBrowserWorkspaceTab(target)
  const page = initial.browserPagesByWorkspace[target.workspaceId]?.find(
    (entry) => entry.id === target.pageId && entry.worktreeId === target.worktreeId
  )
  if (
    Date.now() >= expiresAt ||
    !initial.getKnownWorktreeById(target.worktreeId, target.executionHostId) ||
    !tab ||
    !page
  ) {
    throw new Error('browser_palette_target_unavailable')
  }
  if (initial.activeModal !== 'none' && initial.activeModal !== 'worktree-palette') {
    throw new Error('browser_palette_viewer_busy')
  }
  if (initial.activeModal === 'none') {
    initial.openModal('worktree-palette')
  }
  await waitForPaletteCommit(expiresAt)
  const ready = useAppStore.getState()
  if (
    ready.activeModal !== 'worktree-palette' ||
    !ready.getKnownWorktreeById(target.worktreeId, target.executionHostId) ||
    !getActivatableBrowserWorkspaceTab(target) ||
    !ready.browserPagesByWorkspace[target.workspaceId]?.some(
      (entry) => entry.id === target.pageId && entry.worktreeId === target.worktreeId
    )
  ) {
    throw new Error('browser_palette_target_changed')
  }
  const result = dispatchBrowserPaletteSelection(target, expiresAt)
  await waitForPaletteCommit(expiresAt)
  const current = useAppStore.getState()
  const activeTab = getActivatableBrowserWorkspaceTab(target)
  if (
    Date.now() >= expiresAt ||
    current.activeModal !== 'none' ||
    !activeTab ||
    current.activeWorktreeId !== target.worktreeId ||
    current.groupsByWorktree[target.worktreeId]?.find((group) => group.id === activeTab.groupId)
      ?.activeTabId !== activeTab.id ||
    current.browserTabsByWorktree[target.worktreeId]?.find(
      (workspace) => workspace.id === target.workspaceId
    )?.activePageId !== target.pageId
  ) {
    throw new Error('browser_palette_applied_unknown')
  }
  requestBrowserPaletteFocus(target.pageId, result.focusTarget, expiresAt)
  const focused = useAppStore.getState()
  if (
    Date.now() >= expiresAt ||
    focused.activeModal !== 'none' ||
    focused.activeWorktreeId !== target.worktreeId ||
    !focused.getKnownWorktreeById(target.worktreeId, target.executionHostId) ||
    !getActivatableBrowserWorkspaceTab(target) ||
    focused.browserTabsByWorktree[target.worktreeId]?.find(
      (workspace) => workspace.id === target.workspaceId
    )?.activePageId !== target.pageId
  ) {
    throw new Error('browser_palette_focus_applied_unknown')
  }
  return { ...target, focusTarget: result.focusTarget, focusApplied: true }
}
