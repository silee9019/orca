import { getPaneOwnedActiveHelperTextarea } from '@/components/terminal-pane/regular-terminal-focus-ownership'
import { deriveActiveSurfaceForWorktree } from '@/store/slices/tabs/tabs-surface'
import { structuredAgentSessionOwnerForTab } from './structured-agent-session-owner'
import type { AppState } from '@/store/types'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { isActivityDestinationVisible } from './activity-workspace-destination'

export function isActivitySelectionTargetSelected(
  state: AppState,
  thread: AgentPaneThread,
  executionHostId: string
): boolean {
  const workspaceId = thread.worktree.id
  const tab = state.getActiveTab(workspaceId)
  if (tab?.contentType === 'agent-session') {
    return (
      tab.id === thread.tab.id && structuredAgentSessionOwnerForTab(state, tab) === executionHostId
    )
  }
  const surface = deriveActiveSurfaceForWorktree(state, workspaceId)
  return surface.activeTabType === 'terminal' && surface.activeTabId === thread.tab.id
}

export function readActivitySelectionDestination(
  thread: AgentPaneThread,
  executionHostId: string,
  activeElement: Element | null = document.activeElement
): {
  reached: 'none' | 'terminal-pane' | 'structured-tab'
  contentState: 'ready' | 'empty' | 'loading' | 'error' | 'unknown'
} {
  for (const overlay of document.querySelectorAll<HTMLElement>(
    '[data-structured-agent-session-overlay-tab-id]'
  )) {
    if (
      overlay.dataset.structuredAgentSessionOverlayTabId !== thread.tab.id ||
      !isActivityDestinationVisible(overlay) ||
      !isActivitySelectionDomOwner(overlay, thread, executionHostId)
    ) {
      continue
    }
    const chat = overlay.querySelector<HTMLElement>('[data-native-chat-root]')
    if (!chat || !isActivityDestinationVisible(chat)) {
      continue
    }
    const [phase, kind] = (chat.dataset.nativeChatViewState ?? '').split(':')
    const contentState =
      kind === 'ready' || kind === 'empty' || kind === 'loading' || kind === 'error'
        ? kind
        : 'unknown'
    return {
      reached:
        phase === 'known' && (kind === 'ready' || kind === 'empty') ? 'structured-tab' : 'none',
      contentState
    }
  }
  const parsed = parsePaneKey(thread.paneKey)
  if (!parsed || parsed.tabId !== thread.tab.id) {
    return { reached: 'none', contentState: 'unknown' }
  }
  for (const tab of document.querySelectorAll<HTMLElement>('[data-terminal-tab-id]')) {
    if (tab.dataset.terminalTabId !== thread.tab.id || !isActivityDestinationVisible(tab)) {
      continue
    }
    if (!isActivitySelectionDomOwner(tab, thread, executionHostId)) {
      continue
    }
    for (const leaf of tab.querySelectorAll<HTMLElement>('[data-leaf-id]')) {
      if (leaf.dataset.leafId !== parsed.leafId || !isActivityDestinationVisible(leaf)) {
        continue
      }
      const cover = leaf.querySelector<HTMLElement>('.native-chat-pane-shell')
      if (cover) {
        return {
          reached:
            isActivityDestinationVisible(cover) && cover.contains(activeElement)
              ? 'terminal-pane'
              : 'none',
          contentState: 'unknown'
        }
      }
      const screen = leaf.querySelector<HTMLElement>('.xterm-screen')
      if (
        leaf.dataset.ptyId &&
        screen &&
        isActivityDestinationVisible(screen) &&
        getPaneOwnedActiveHelperTextarea(leaf, activeElement)
      ) {
        return { reached: 'terminal-pane', contentState: 'unknown' }
      }
    }
  }
  return { reached: 'none', contentState: 'unknown' }
}

function isActivitySelectionDomOwner(
  element: HTMLElement,
  thread: AgentPaneThread,
  executionHostId: string
): boolean {
  if (thread.worktree.id === FLOATING_TERMINAL_WORKTREE_ID) {
    return (
      executionHostId === LOCAL_EXECUTION_HOST_ID &&
      element.closest('[data-floating-terminal-panel]') !== null
    )
  }
  const root = element.closest<HTMLElement>('[data-rendered-active-worktree-id]')
  return (
    root?.dataset.renderedActiveWorktreeId === thread.worktree.id &&
    root.dataset.renderedActiveExecutionHostId === executionHostId
  )
}
