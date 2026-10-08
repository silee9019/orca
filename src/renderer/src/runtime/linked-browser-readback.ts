import { useAppStore } from '@/store'
import type {
  LinkedBrowserCommand,
  LinkedBrowserState
} from '../../../shared/rpc-contract/linked-browser-params'

export function observeLinkedBrowserCreation(
  command: LinkedBrowserCommand,
  expiresAt: number,
  expectedPageRuntime: string | null,
  perform: () => void | Promise<boolean>,
  finish: (error?: Error, state?: LinkedBrowserState) => void
): { cancel: () => void; settled: boolean } {
  const before = useAppStore.getState()
  const previous = new Set(before.browserTabsByWorktree[command.workspaceId]?.map((tab) => tab.id))
  let stop = (): void => {}
  let settled = false
  let invoked = false
  const complete = (error?: Error, state?: LinkedBrowserState): void => {
    if (settled) {
      return
    }
    settled = true
    clearTimeout(timer)
    stop()
    finish(error, state)
  }
  const cancel = (): void => complete(new Error('linked_browser_effect_unknown'))
  const timer = setTimeout(cancel, Math.max(0, expiresAt - Date.now()))
  const readBack = (): void => {
    if (!invoked || settled) {
      return
    }
    if (Date.now() >= expiresAt) {
      cancel()
      return
    }
    const after = useAppStore.getState()
    const candidates =
      after.browserTabsByWorktree[command.workspaceId]?.filter(
        (tab) =>
          !previous.has(tab.id) &&
          after.browserPagesByWorkspace[tab.id]?.some(
            (page) =>
              page.id === tab.activePageId &&
              page.url === command.url &&
              (page.browserRuntimeEnvironmentId ?? null) === expectedPageRuntime
          )
      ) ?? []
    if (candidates.length !== 1) {
      return
    }
    const tab = candidates[0]
    const wrapper = after.unifiedTabsByWorktree[command.workspaceId]?.find(
      (item) => item.contentType === 'browser' && item.entityId === tab.id
    )
    const group =
      wrapper &&
      after.groupsByWorktree[command.workspaceId]?.find(
        (item) => item.id === wrapper.groupId && item.tabOrder.includes(wrapper.id)
      )
    if (
      !tab.activePageId ||
      !wrapper ||
      !group ||
      group.activeTabId !== wrapper.id ||
      after.activeBrowserTabIdByWorktree[command.workspaceId] !== tab.id
    ) {
      return
    }
    complete(undefined, {
      browserTabId: tab.id,
      pageId: tab.activePageId,
      groupId: group.id,
      hoverCloseRequested: true,
      active: true,
      addressFocusRequested: after.pendingAddressBarFocusByPageId[tab.activePageId] === true
    })
  }
  stop = useAppStore.subscribe(readBack)
  try {
    if (Date.now() >= expiresAt) {
      cancel()
    } else {
      void Promise.resolve(perform()).then((applied) => {
        if (applied !== true) {
          cancel()
          return
        }
        invoked = true
        readBack()
      }, cancel)
    }
  } catch {
    cancel()
  }
  return { cancel, settled }
}
