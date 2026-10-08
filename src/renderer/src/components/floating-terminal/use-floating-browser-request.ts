import { useEffect, useRef } from 'react'
import { FLOATING_BROWSER_EVENT } from '@/runtime/floating-browser-request'
import { useAppStore } from '@/store'
import { FLOATING_TERMINAL_WORKTREE_ID as workspace } from '../../../../shared/constants'
import type { BrowserTab } from '../../../../shared/browser-workspace-types'
import { FloatingBrowserCommand } from '../../../../shared/rpc-contract/floating-browser-params'

type Options = {
  viewerOpen: boolean
  groupId?: string
  create: () => BrowserTab | undefined
  duplicate: (browserTabId: string, sourceUnifiedTabId: string) => BrowserTab | undefined
}
export function useFloatingBrowserRequest(options: Options): void {
  const current = useRef(options)
  current.current = options
  useEffect(() => {
    const receive = (event: WindowEventMap[typeof FLOATING_BROWSER_EVENT]): void => {
      const request = event.detail
      if (!request.claim()) {
        return
      }
      try {
        const command = FloatingBrowserCommand.parse(request.command)
        const owner = current.current
        const before = useAppStore.getState()
        if (Date.now() >= request.expiresAt || !owner.viewerOpen || before.activeModal !== 'none') {
          throw new Error('floating_browser_owner_inactive')
        }
        if (
          owner.groupId !== command.groupId ||
          before.activeGroupIdByWorktree[workspace] !== command.groupId
        ) {
          throw new Error('floating_browser_group_mismatch')
        }
        const source =
          command.action === 'duplicate'
            ? before.browserTabsByWorktree[workspace]?.find(
                (tab) => tab.id === command.browserTabId
              )
            : undefined
        if (command.action === 'duplicate') {
          const wrapper = before.unifiedTabsByWorktree[workspace]?.find(
            (tab) => tab.id === command.sourceUnifiedTabId
          )
          if (
            !source ||
            before.browserPagesByWorkspace[source.id]?.some(
              (page) =>
                page.browserRuntimeEnvironmentId || before.remoteBrowserPageHandlesByPageId[page.id]
            ) ||
            wrapper?.contentType !== 'browser' ||
            wrapper.entityId !== source.id ||
            wrapper.groupId !== command.groupId
          ) {
            throw new Error('floating_browser_source_mismatch')
          }
        }
        const tab =
          command.action === 'new'
            ? owner.create()
            : owner.duplicate(command.browserTabId, command.sourceUnifiedTabId)
        if (!tab?.activePageId) {
          throw new Error('floating_browser_creation_not_acknowledged')
        }
        const after = useAppStore.getState()
        const wrapper = after.unifiedTabsByWorktree[workspace]?.find(
          (item) => item.contentType === 'browser' && item.entityId === tab.id
        )
        const group = after.groupsByWorktree[workspace]?.find(
          (group) => group.id === command.groupId
        )
        const insertionIndex = wrapper ? (group?.tabOrder.indexOf(wrapper.id) ?? -1) : -1
        if (
          !wrapper ||
          wrapper.groupId !== command.groupId ||
          insertionIndex < 0 ||
          !after.browserPagesByWorkspace[tab.id]?.some(
            (page) => page.id === tab.activePageId && page.browserRuntimeEnvironmentId === null
          )
        ) {
          throw new Error('floating_browser_readback_failed')
        }
        const active =
          after.activeBrowserTabIdByWorktree[workspace] === tab.id &&
          group?.activeTabId === wrapper.id
        const profilePreserved =
          !source || (tab.sessionProfileId ?? null) === (source.sessionProfileId ?? null)
        const partitionPreserved =
          !source || (tab.sessionPartition ?? null) === (source.sessionPartition ?? null)
        const sourceIndex =
          command.action === 'duplicate'
            ? (before.groupsByWorktree[workspace]
                ?.find((group) => group.id === command.groupId)
                ?.tabOrder.indexOf(command.sourceUnifiedTabId) ?? -1)
            : -1
        if (
          !active ||
          !profilePreserved ||
          !partitionPreserved ||
          (command.action === 'duplicate' && insertionIndex !== sourceIndex + 1)
        ) {
          throw new Error('floating_browser_creation_effect_incomplete')
        }
        request.finish(undefined, {
          browserTabId: tab.id,
          pageId: tab.activePageId,
          unifiedTabId: wrapper.id,
          groupId: wrapper.groupId,
          insertionIndex,
          active,
          addressFocusRequested: after.pendingAddressBarFocusByPageId[tab.activePageId] === true,
          profilePreserved,
          partitionPreserved
        })
      } catch {
        request.finish(new Error('floating_browser_action_failed_effect_unknown'))
      }
    }
    window.addEventListener(FLOATING_BROWSER_EVENT, receive)
    return () => window.removeEventListener(FLOATING_BROWSER_EVENT, receive)
  }, [])
}
