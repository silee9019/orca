import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import {
  BROWSER_TAB_UI_COMMAND_EVENT,
  type BrowserTabUiEvent
} from '@/runtime/browser-tab-ui-request'
import { BrowserTabUiPoint } from '../../../../shared/rpc-contract/browser-tab-ui-params'
import type {
  BrowserTabUiState,
  BrowserTabUiTarget
} from '../../../../shared/rpc-contract/browser-tab-ui-params'
type TabUiOwner = {
  target: BrowserTabUiTarget
  menuOpen: boolean
  menuPoint: BrowserTabUiPoint
  menu: (open: boolean, point?: BrowserTabUiPoint) => void
  activate: () => void
  close: () => void
  closeOthers: () => void
  closeLeft: () => void
  closeRight: () => void
  togglePin: () => void
  duplicate?: () => void
}
function readTabUi(owner: TabUiOwner): BrowserTabUiState {
  const target = owner.target
  const state = useAppStore.getState()
  const item = state.unifiedTabsByWorktree[target.worktree]?.find(
    (tab) => tab.id === target.unifiedTab
  )
  const group = state.groupsByWorktree[target.worktree]?.find((group) => group.id === target.group)
  return {
    target,
    menu: { open: owner.menuOpen, point: owner.menuPoint },
    exists: Boolean(
      item &&
      state.browserTabsByWorktree[target.worktree]?.some(
        (workspace) => workspace.id === target.workspace
      )
    ),
    pinned: item?.isPinned === true,
    activeGroup: state.activeGroupIdByWorktree[target.worktree] ?? null,
    activeTab: group?.activeTabId ?? null,
    activeWorkspace: state.activeBrowserTabIdByWorktree[target.worktree] ?? null,
    activeType: state.activeTabTypeByWorktree[target.worktree] ?? null,
    tabOrder: [...(group?.tabOrder ?? [])],
    closedTabs: [],
    guestRegistrationVerified: false
  }
}
function assertLocalTarget(target: BrowserTabUiTarget): void {
  const state = useAppStore.getState()
  if (!state.settings || !state.persistedUIReady || state.settings.activeRuntimeEnvironmentId) {
    throw new Error('browser_tab_ui_viewer_not_ready')
  }
  const item = state.unifiedTabsByWorktree[target.worktree]?.find(
    (tab) => tab.id === target.unifiedTab
  )
  const workspace = state.browserTabsByWorktree[target.worktree]?.find(
    (workspace) => workspace.id === target.workspace
  )
  const group = state.groupsByWorktree[target.worktree]?.find((group) => group.id === target.group)
  if (
    !workspace ||
    workspace.worktreeId !== target.worktree ||
    !item ||
    item.entityId !== target.workspace ||
    item.contentType !== 'browser' ||
    item.groupId !== target.group ||
    !group?.tabOrder.includes(item.id)
  ) {
    throw new Error('browser_tab_ui_target_mismatch')
  }
  if (
    (item.executionHostId && item.executionHostId !== 'local') ||
    (state.browserPagesByWorkspace[target.workspace] ?? []).some(
      (page) => page.browserRuntimeEnvironmentId || state.remoteBrowserPageHandlesByPageId[page.id]
    )
  ) {
    throw new Error('browser_tab_ui_host_mismatch')
  }
}
export function useBrowserTabUiCommands(owner: TabUiOwner): void {
  const pendingMenu = useRef<BrowserTabUiEvent | null>(null)
  const current = useRef(owner)
  useLayoutEffect(() => {
    current.current = owner
  })
  useEffect(() => {
    const request = pendingMenu.current
    if (!request) {
      return
    }
    if (request.isSettled()) {
      pendingMenu.current = null
      return
    }
    if (
      owner.menuOpen === (request.action === 'menu-open') &&
      (request.action !== 'menu-open' ||
        (owner.menuPoint.x === request.point?.x && owner.menuPoint.y === request.point?.y))
    ) {
      request.finish(undefined, readTabUi(owner))
      pendingMenu.current = null
    }
  })
  useEffect(
    () => () => {
      pendingMenu.current?.finish(new Error('browser_tab_menu_unavailable_effect_unknown'))
      pendingMenu.current = null
    },
    []
  )
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-tab-ui-command']): void => {
      const request = event.detail
      const owner = current.current
      const target = owner.target
      if (
        request.target.workspace !== target.workspace ||
        request.target.worktree !== target.worktree ||
        request.target.group !== target.group ||
        request.target.unifiedTab !== target.unifiedTab ||
        !request.claim()
      ) {
        return
      }
      try {
        if (Date.now() >= request.expiresAt) {
          throw new Error('request_expired')
        }
        assertLocalTarget(target)
        if (request.action === 'menu-open' || request.action === 'menu-close') {
          if (pendingMenu.current && !pendingMenu.current.isSettled()) {
            throw new Error('browser_tab_menu_busy')
          }
          if (
            request.action === 'menu-open' &&
            !BrowserTabUiPoint.safeParse(request.point).success
          ) {
            throw new Error('browser_tab_menu_point_required')
          }
          if (
            owner.menuOpen === (request.action === 'menu-open') &&
            (request.action !== 'menu-open' ||
              (owner.menuPoint.x === request.point?.x && owner.menuPoint.y === request.point?.y))
          ) {
            owner.menu(request.action === 'menu-open', request.point)
            request.finish(undefined, readTabUi(owner))
          } else {
            pendingMenu.current = request
            owner.menu(request.action === 'menu-open', request.point)
          }
          return
        }
        const before = readTabUi(owner)
        const store = useAppStore.getState()
        const items = store.unifiedTabsByWorktree[target.worktree] ?? []
        const workspaceIds = new Set(
          (store.browserTabsByWorktree[target.worktree] ?? []).map((workspace) => workspace.id)
        )
        const source = store.browserTabsByWorktree[target.worktree]?.find(
          (workspace) => workspace.id === target.workspace
        )
        const index = before.tabOrder.indexOf(target.unifiedTab)
        let expectedClosed: string[] = []
        if (request.action === 'activate') {
          owner.activate()
        } else if (request.action === 'toggle-pin') {
          owner.togglePin()
        } else if (request.action === 'duplicate') {
          if (!owner.duplicate) {
            throw new Error('browser_tab_ui_duplicate_unavailable')
          }
          owner.duplicate()
        } else if (request.action === 'close') {
          if (before.pinned) {
            throw new Error('browser_tab_ui_pinned')
          }
          expectedClosed = [target.unifiedTab]
          owner.close()
        } else if (request.action !== 'status') {
          const scope =
            request.action === 'close-left'
              ? before.tabOrder.slice(0, index)
              : request.action === 'close-right'
                ? before.tabOrder.slice(index + 1)
                : before.tabOrder.filter((id) => id !== target.unifiedTab)
          expectedClosed = scope.filter((id) =>
            items.some((item) => item.id === id && item.groupId === target.group && !item.isPinned)
          )
          if (request.action === 'close-left') {
            owner.closeLeft()
          } else if (request.action === 'close-right') {
            owner.closeRight()
          } else {
            owner.closeOthers()
          }
        }
        const after = readTabUi(current.current)
        const state = useAppStore.getState()
        after.closedTabs = expectedClosed.filter(
          (id) => !state.unifiedTabsByWorktree[target.worktree]?.some((item) => item.id === id)
        )
        let applied = expectedClosed.length === after.closedTabs.length
        if (request.action.startsWith('close')) {
          applied =
            applied &&
            items.every(
              (item) =>
                expectedClosed.includes(item.id) ||
                state.unifiedTabsByWorktree[target.worktree]?.some(
                  (remaining) => remaining.id === item.id
                )
            )
        }
        if (request.action === 'activate') {
          applied =
            after.activeGroup === target.group &&
            after.activeTab === target.unifiedTab &&
            after.activeWorkspace === target.workspace &&
            after.activeType === 'browser'
        } else if (request.action === 'toggle-pin') {
          applied = after.pinned !== before.pinned
        } else if (request.action === 'close') {
          applied = applied && !after.exists
        } else if (request.action === 'duplicate') {
          const duplicates = (state.browserTabsByWorktree[target.worktree] ?? []).filter(
            (workspace) =>
              !workspaceIds.has(workspace.id) &&
              workspace.url === source?.url &&
              workspace.title === source?.title &&
              workspace.sessionProfileId === source?.sessionProfileId &&
              workspace.sessionPartition === source?.sessionPartition
          )
          const duplicate = duplicates.length === 1 ? duplicates[0] : undefined
          const item = state.unifiedTabsByWorktree[target.worktree]?.find(
            (item) =>
              item.contentType === 'browser' &&
              item.entityId === duplicate?.id &&
              item.groupId === target.group
          )
          applied = Boolean(item && after.tabOrder[index + 1] === item.id)
          if (applied && duplicate) {
            after.duplicatedWorkspace = duplicate.id
          }
        }
        if (!applied) {
          throw new Error('browser_tab_ui_not_applied_effect_unknown')
        }
        request.finish(undefined, after)
      } catch (error) {
        request.finish(
          error instanceof Error ? error : new Error('browser_tab_ui_failed_effect_unknown')
        )
      }
    }
    window.addEventListener(BROWSER_TAB_UI_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_TAB_UI_COMMAND_EVENT, receive)
  }, [])
}
