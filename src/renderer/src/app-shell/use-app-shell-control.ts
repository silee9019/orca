import { TOGGLE_TERMINAL_PANE_EXPAND_EVENT } from '../constants/terminal'
import { showOnboardingFromRenderer } from '../components/onboarding/show-onboarding-event'
import { useAppStore } from '../store'
import { useAppSurfaceControl } from '../hooks/ipc-events/app-surface-ipc-bridge'
import type { FloatingWorkspacePanelState } from './use-floating-workspace-panel'

export function useAppShellControl(
  floating: Pick<FloatingWorkspacePanelState, 'open' | 'enabled' | 'setOpenWithFocus'>
): void {
  useAppSurfaceControl('shell', async (input) => {
    if (input.kind !== 'shell') {
      return
    }
    const store = useAppStore.getState()
    switch (input.action) {
      case 'status':
        return {
          sidebarOpen: store.sidebarOpen,
          rightSidebarOpen: store.rightSidebarOpen,
          floatingOpen: floating.open,
          floatingEnabled: floating.enabled
        }
      case 'sidebar':
        store.toggleSidebar()
        break
      case 'right-sidebar':
        store.toggleRightSidebar()
        break
      case 'menu':
        window.api.ui.popupMenu()
        break
      case 'minimize':
        window.api.ui.minimize()
        break
      case 'maximize':
        window.api.ui.maximize()
        break
      case 'close':
        window.api.ui.requestClose()
        break
      case 'update-card':
        if (input.open === undefined) {
          throw new Error('Specify open')
        }
        store.setUpdateCardCollapsed(!input.open)
        break
      case 'remote-updates':
        if (input.open === undefined) {
          throw new Error('Specify open')
        }
        store.setRemoteServerUpdateDialogOpen(input.open)
        break
      case 'floating':
        if (!floating.enabled || input.open === undefined) {
          throw new Error('Enable floating workspace and specify open')
        }
        floating.setOpenWithFocus(input.open)
        break
      case 'onboarding':
        await showOnboardingFromRenderer()
        break
      case 'feedback':
        if (
          window.dispatchEvent(new CustomEvent('orca:open-sidebar-feedback', { cancelable: true }))
        ) {
          throw new Error('The feedback menu is not mounted')
        }
        break
      case 'expand':
        if (
          !input.tabId ||
          !Object.values(store.tabsByWorktree).some((tabs) =>
            tabs.some((tab) => tab.id === input.tabId)
          )
        ) {
          throw new Error('Specify an existing terminal tabId')
        }
        window.dispatchEvent(
          new CustomEvent(TOGGLE_TERMINAL_PANE_EXPAND_EVENT, { detail: { tabId: input.tabId } })
        )
        break
    }
    return { state: 'requested' }
  })
}
