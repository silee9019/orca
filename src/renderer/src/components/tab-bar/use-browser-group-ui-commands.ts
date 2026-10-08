import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { getClientCreationActionPolicy } from '@/lib/client-creation-action-policy'
import { getActiveExecutionHostIdForWorktree } from '@/lib/unified-tab-host-ownership'
import { BROWSER_GROUP_UI_COMMAND_EVENT } from '@/runtime/browser-group-ui-request'
import type {
  BrowserGroupUiState,
  BrowserGroupUiTarget
} from '../../../../shared/rpc-contract/browser-group-ui-params'
type BrowserGroupUiOwner = {
  target: BrowserGroupUiTarget
  enabled: boolean
  newBrowser: () => void
}
function snapshot(target: BrowserGroupUiTarget): BrowserGroupUiState {
  const state = useAppStore.getState()
  const group = state.groupsByWorktree[target.worktree]?.find((item) => item.id === target.group)
  return {
    target,
    tabOrder: [...(group?.tabOrder ?? [])],
    activeTab: group?.activeTabId ?? null,
    activeWorkspace: state.activeBrowserTabIdByWorktree[target.worktree] ?? null,
    activeGroup: state.activeGroupIdByWorktree[target.worktree] ?? null,
    activeType: state.activeTabTypeByWorktree[target.worktree] ?? null,
    guestRegistrationVerified: false
  }
}
export function useBrowserGroupUiCommands(owner: BrowserGroupUiOwner | undefined): void {
  const current = useRef(owner)
  const running = useRef(false)
  useLayoutEffect(() => {
    current.current = owner
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-group-ui-command']): void => {
      const request = event.detail
      const owner = current.current
      if (!owner) {
        return
      }
      const target = owner.target
      if (
        request.target.worktree !== target.worktree ||
        request.target.group !== target.group ||
        !request.claim()
      ) {
        return
      }
      let started = false
      try {
        if (request.isSettled() || Date.now() >= request.expiresAt) {
          throw new Error('request_expired')
        }
        const state = useAppStore.getState()
        if (
          !state.settings ||
          !state.persistedUIReady ||
          state.settings.activeRuntimeEnvironmentId
        ) {
          throw new Error('browser_group_ui_viewer_not_ready')
        }
        if (!state.groupsByWorktree[target.worktree]?.some((group) => group.id === target.group)) {
          throw new Error('browser_group_ui_target_mismatch')
        }
        if (request.action === 'status') {
          request.finish(undefined, snapshot(target))
          return
        }
        if (running.current) {
          throw new Error('browser_group_ui_busy')
        }
        const policy = getClientCreationActionPolicy(state, target.worktree)['managed-browser']
        if (!owner.enabled || policy.state !== 'enabled') {
          throw new Error('browser_group_ui_creation_disabled')
        }
        if (policy.provider !== 'local-client') {
          throw new Error('browser_group_ui_paired_creation_unsupported')
        }
        const host = getActiveExecutionHostIdForWorktree(state, target.worktree)
        if (host && host !== 'local') {
          throw new Error('browser_group_ui_host_mismatch')
        }
        const oldIds = new Set(
          (state.browserTabsByWorktree[target.worktree] ?? []).map((tab) => tab.id)
        )
        const before = snapshot(target)
        const url = state.browserDefaultUrl ?? 'about:blank'
        running.current = true
        started = true
        owner.newBrowser()
        const afterState = useAppStore.getState()
        const created = (afterState.browserTabsByWorktree[target.worktree] ?? []).filter(
          (tab) => !oldIds.has(tab.id)
        )
        const workspace = created.length === 1 ? created[0] : undefined
        const tab = afterState.unifiedTabsByWorktree[target.worktree]?.find(
          (tab) =>
            tab.contentType === 'browser' &&
            tab.entityId === workspace?.id &&
            tab.groupId === target.group
        )
        const after = snapshot(target)
        const pages = workspace ? afterState.browserPagesByWorkspace[workspace.id] : undefined
        const page = pages?.length === 1 ? pages[0] : undefined
        if (
          !workspace ||
          !tab ||
          !page ||
          workspace.worktreeId !== target.worktree ||
          page.url !== url ||
          page.browserRuntimeEnvironmentId ||
          afterState.remoteBrowserPageHandlesByPageId[page.id] ||
          (tab.executionHostId && tab.executionHostId !== 'local') ||
          after.tabOrder.length !== before.tabOrder.length + 1 ||
          after.tabOrder.at(-1) !== tab.id ||
          before.tabOrder.some((id, index) => after.tabOrder[index] !== id) ||
          after.activeTab !== tab.id ||
          after.activeGroup !== target.group ||
          after.activeType !== 'browser' ||
          after.activeWorkspace !== workspace.id
        ) {
          throw new Error('browser_group_ui_creation_effect_unknown')
        }
        request.finish(undefined, {
          ...after,
          createdWorkspace: workspace.id,
          addressFocusRequested: afterState.pendingAddressBarFocusByPageId[page.id] === true
        })
      } catch (error) {
        request.finish(
          error instanceof Error ? error : new Error('browser_group_ui_failed_effect_unknown')
        )
      } finally {
        if (started) {
          running.current = false
        }
      }
    }
    window.addEventListener(BROWSER_GROUP_UI_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_GROUP_UI_COMMAND_EVENT, receive)
  }, [])
}
