import { useAppStore } from '@/store'
import { getClientCreationActionPolicy } from '@/lib/client-creation-action-policy'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import {
  BROWSER_NEW_TAB_COMMAND_EVENT,
  type BrowserNewTabEvent
} from '@/runtime/browser-new-tab-request'
import { resolveBrowserNewTabInvocation } from './browser-new-tab-owner'
export function registerBrowserNewTabCommands(create: () => Promise<void>): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {}
  }
  let running = false
  let disposed = false
  let pending: BrowserNewTabEvent | undefined
  const receive = (event: WindowEventMap['orca:browser-new-tab-command']): void => {
    const request = event.detail
    request.offer(true, () => {
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      if (running) {
        request.finish(new Error('browser_new_tab_busy'))
        return
      }
      const before = useAppStore.getState()
      const invocation = resolveBrowserNewTabInvocation(before)
      const target = request.target
      const policy = getClientCreationActionPolicy(before, target.worktree)['managed-browser']
      const host = getResolvedExecutionHostIdForWorktree(before, target.worktree)
      if (invocation.worktree !== target.worktree || invocation.group !== target.group) {
        request.finish(new Error('browser_new_tab_invocation_mismatch'))
        return
      }
      if (
        target.group &&
        !before.groupsByWorktree[target.worktree]?.some((group) => group.id === target.group)
      ) {
        request.finish(new Error('browser_new_tab_group_missing'))
        return
      }
      if (policy.state !== 'enabled' || policy.provider !== 'local-client') {
        request.finish(new Error('browser_new_tab_paired_or_disabled_unsupported'))
        return
      }
      if (host !== 'local') {
        request.finish(new Error('browser_new_tab_host_mismatch'))
        return
      }
      const oldIds = new Set(
        (before.browserTabsByWorktree[target.worktree] ?? []).map((tab) => tab.id)
      )
      const oldOrder =
        before.groupsByWorktree[target.worktree]?.find((group) => group.id === target.group)
          ?.tabOrder ?? []
      running = true
      pending = request
      let created: Promise<void>
      try {
        created = create()
      } catch {
        running = false
        pending = undefined
        request.finish(new Error('browser_new_tab_failed_effect_unknown'))
        return
      }
      const immediate = useAppStore.getState()
      const candidates = (immediate.browserTabsByWorktree[target.worktree] ?? []).filter(
        (tab) => !oldIds.has(tab.id)
      )
      const workspace = candidates.length === 1 ? candidates[0] : undefined
      const pages = workspace ? immediate.browserPagesByWorkspace[workspace.id] : undefined
      const page = pages?.length === 1 ? pages[0] : undefined
      const focusRequested = page && immediate.pendingAddressBarFocusByPageId[page.id] === true
      void created
        .then(
          () => {
            const after = useAppStore.getState()
            const tabs = (after.unifiedTabsByWorktree[target.worktree] ?? []).filter(
              (tab) => tab.contentType === 'browser' && tab.entityId === workspace?.id
            )
            const tab = tabs.length === 1 ? tabs[0] : undefined
            const group = after.groupsByWorktree[target.worktree]?.find(
              (group) => group.id === (target.group ?? tab?.groupId)
            )
            if (
              disposed ||
              Date.now() >= request.expiresAt ||
              !workspace ||
              !page ||
              !tab ||
              !group ||
              !focusRequested ||
              page.url !== (before.browserDefaultUrl ?? 'about:blank') ||
              page.browserRuntimeEnvironmentId ||
              after.remoteBrowserPageHandlesByPageId[page.id] ||
              (tab.executionHostId && tab.executionHostId !== 'local') ||
              tab.groupId !== group.id ||
              !after.browserTabsByWorktree[target.worktree]?.some(
                (entry) => entry.id === workspace.id
              ) ||
              !after.browserPagesByWorkspace[workspace.id]?.some((entry) => entry.id === page.id) ||
              group.activeTabId !== tab.id ||
              after.activeGroupIdByWorktree[target.worktree] !== group.id ||
              after.activeBrowserTabIdByWorktree[target.worktree] !== workspace.id ||
              after.activeTabTypeByWorktree[target.worktree] !== 'browser' ||
              group.tabOrder.length !== oldOrder.length + 1 ||
              group.tabOrder.at(-1) !== tab.id ||
              oldOrder.some((id, index) => group.tabOrder[index] !== id) ||
              after.activeWorktreeId !== before.activeWorktreeId ||
              (!invocation.floating &&
                (after.activeBrowserTabId !== workspace.id || after.activeTabType !== 'browser')) ||
              (invocation.floating &&
                (after.activeBrowserTabId !== before.activeBrowserTabId ||
                  after.activeTabType !== before.activeTabType))
            ) {
              request.finish(new Error('browser_new_tab_effect_unknown'))
              return
            }
            request.finish(undefined, {
              target,
              workspace: workspace.id,
              page: page.id,
              unifiedTab: tab.id,
              placement: invocation.floating ? 'floating' : 'workspace',
              addressFocusRequested: true,
              guestRegistrationVerified: false
            })
          },
          () => request.finish(new Error('browser_new_tab_failed_effect_unknown'))
        )
        .finally(() => {
          running = false
          pending = undefined
        })
    })
  }
  window.addEventListener(BROWSER_NEW_TAB_COMMAND_EVENT, receive)
  return () => {
    disposed = true
    pending?.finish(new Error('browser_new_tab_unavailable_effect_unknown'))
    window.removeEventListener(BROWSER_NEW_TAB_COMMAND_EVENT, receive)
  }
}
