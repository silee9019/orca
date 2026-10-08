import { normalizeUrl } from '@/store/slices/browser-page-records'
import { useCallback } from 'react'
import { useAppStore } from '@/store'
import { resolveBrowserSourceUnifiedTab } from '@/lib/browser-workspace-source-resolution'
import { getClientCreationActionPolicy } from '@/lib/client-creation-action-policy'
import { getActiveExecutionHostIdForWorktree } from '@/lib/unified-tab-host-ownership'
import { insertTabIdIntoOrder } from '@/store/slices/tabs/tabs-tab-order'
import type { BrowserContextLinkTabState } from '../../../../../shared/rpc-contract/browser-context-menu-params'
import type { BrowserPageContextMenuState } from '../describe-page/browser-page-types'
export function useBrowserContextMenuLinkTab(
  menu: BrowserPageContextMenuState | null,
  close: () => void,
  worktreeId: string,
  browserPageId: string
): (verified?: boolean) => void | BrowserContextLinkTabState {
  const createBrowserTab = useAppStore((state) => state.createBrowserTab)
  return useCallback(
    (verified = false) => {
      if (!menu?.linkUrl) {
        throw new Error('browser_context_menu_link_unavailable')
      }
      const before = useAppStore.getState()
      const source = resolveBrowserSourceUnifiedTab(before, browserPageId, worktreeId)
      const group = before.groupsByWorktree[worktreeId]?.find((item) => item.id === source?.groupId)
      if (verified) {
        const policy = getClientCreationActionPolicy(before, worktreeId)['managed-browser']
        if (!source || !group || !group.activeTabId) {
          throw new Error('browser_context_menu_source_placement_unavailable')
        }
        if (policy.state !== 'enabled' || policy.provider !== 'local-client') {
          throw new Error('browser_context_menu_link_creation_unsupported')
        }
        const host = getActiveExecutionHostIdForWorktree(before, worktreeId)
        if (
          (host && host !== 'local') ||
          (source.executionHostId && source.executionHostId !== 'local')
        ) {
          throw new Error('browser_context_menu_link_host_mismatch')
        }
      }
      const workspace = createBrowserTab(worktreeId, menu.linkUrl, {
        title: menu.linkUrl,
        activate: false,
        ...(source ? { afterTabId: source.id } : {}),
        ...(source?.executionHostId ? { executionHostId: source.executionHostId } : {})
      })
      close()
      if (!verified) {
        return
      }
      const after = useAppStore.getState()
      const pages = after.browserPagesByWorkspace[workspace.id]
      const page = pages?.length === 1 ? pages[0] : undefined
      const wrappers =
        after.unifiedTabsByWorktree[worktreeId]?.filter(
          (tab) => tab.contentType === 'browser' && tab.entityId === workspace.id
        ) ?? []
      const wrapper = wrappers.length === 1 ? wrappers[0] : undefined
      const afterGroup = after.groupsByWorktree[worktreeId]?.find((item) => item.id === group?.id)
      if (!source || !group || !page || !wrapper || !afterGroup) {
        throw new Error('browser_context_menu_link_creation_effect_unknown')
      }
      const expected = insertTabIdIntoOrder(
        group.tabOrder,
        before.unifiedTabsByWorktree[worktreeId] ?? [],
        wrapper.id,
        false,
        source.id
      )
      if (
        before.browserTabsByWorktree[worktreeId]?.some((tab) => tab.id === workspace.id) ||
        !after.browserTabsByWorktree[worktreeId]?.some((tab) => tab.id === workspace.id) ||
        workspace.worktreeId !== worktreeId ||
        page.url !== normalizeUrl(menu.linkUrl) ||
        page.browserRuntimeEnvironmentId ||
        after.remoteBrowserPageHandlesByPageId[page.id] ||
        wrapper.groupId !== group.id ||
        (wrapper.executionHostId && wrapper.executionHostId !== 'local') ||
        afterGroup.tabOrder.length !== expected.length ||
        expected.some((id, index) => afterGroup.tabOrder[index] !== id) ||
        afterGroup.activeTabId !== group.activeTabId ||
        after.activeGroupIdByWorktree[worktreeId] !== before.activeGroupIdByWorktree[worktreeId] ||
        after.activeBrowserTabIdByWorktree[worktreeId] !==
          before.activeBrowserTabIdByWorktree[worktreeId] ||
        after.activeTabTypeByWorktree[worktreeId] !== before.activeTabTypeByWorktree[worktreeId] ||
        after.activeWorktreeId !== before.activeWorktreeId ||
        after.activeBrowserTabId !== before.activeBrowserTabId ||
        after.activeTabType !== before.activeTabType
      ) {
        throw new Error('browser_context_menu_link_creation_effect_unknown')
      }
      return {
        workspace: workspace.id,
        page: page.id,
        unifiedTab: wrapper.id,
        group: group.id,
        tabOrder: [...afterGroup.tabOrder],
        activated: false,
        guestRegistrationVerified: false
      }
    },
    [menu, close, worktreeId, browserPageId, createBrowserTab]
  )
}
