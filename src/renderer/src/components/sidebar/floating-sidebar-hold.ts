import { isEditableTarget } from '@/lib/editable-target'
import { WORKSPACE_BOARD_ESCAPE_BLOCKING_OVERLAY_SELECTOR } from './useWorkspaceBoardPanel'

// Why: matches the 36px `.titlebar` / `.titlebar-left` height in main.css, which has no shared constant.
export const FLOATING_SIDEBAR_TITLEBAR_INSET_PX = 36

// Why: only popups that are open count; the worktree list itself is a permanent role="listbox" with no data-state.
export function hasOpenFloatingSidebarPopup(root: ParentNode): boolean {
  return root.querySelector(WORKSPACE_BOARD_ESCAPE_BLOCKING_OVERLAY_SELECTOR) !== null
}

// Why: menus and clicks hand focus back to a button inside the panel; only typing targets and keyboard focus (Tab) should pin it open.
export function isPanelFocusHolding(panel: HTMLElement | null, active: Element | null): boolean {
  if (!panel || !active || !panel.contains(active)) {
    return false
  }
  if (isEditableTarget(active)) {
    return true
  }
  try {
    return active.matches(':focus-visible')
  } catch {
    return false
  }
}

export function isFloatingSidebarHeld(input: {
  pointerDown: boolean
  panelHasFocus: boolean
  hasOpenPopup: boolean
  hasModal: boolean
}): boolean {
  return input.pointerDown || input.panelHasFocus || input.hasOpenPopup || input.hasModal
}

// Why: the floating titlebar-left leaves flow, so the overlay would otherwise start at y=0 under the window controls.
export function resolveFloatingSidebarTopInset(input: {
  shouldMount: boolean
  isFloating: boolean
}): number {
  return input.shouldMount && input.isFloating ? FLOATING_SIDEBAR_TITLEBAR_INSET_PX : 0
}
