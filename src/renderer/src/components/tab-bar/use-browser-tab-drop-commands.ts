import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { BROWSER_TAB_DROP_EVENT } from '@/runtime/browser-tab-drop-request'
import { captureWebSessionIntentOwner } from '@/runtime/web-runtime-session-environment'
import type { BrowserTabDropEvent } from '@/runtime/browser-tab-drop-request'
import type {
  BrowserTabDropTarget,
  BrowserTabDropReceipt
} from '../../../../shared/rpc-contract/browser-tab-drop-params'
import type { TabDragItemData } from '../tab-group/tab-drag-data'
import { commitResolvedTabDrop } from '../tab-group/tab-drag-drop-commit'
import {
  captureTabDragActivationSnapshot,
  restoreTabDragActivationSnapshot,
  restoreSourceGroupActiveTabAfterCrossGroupDrop
} from '../tab-group/tab-drag-preview-activation'
import {
  readBrowserTabDropSource,
  resolveBrowserTabDropDestination
} from './browser-tab-drop-target'

type DropOwner = { workspace: string; dragData: TabDragItemData }
function matches(owner: DropOwner, target: BrowserTabDropTarget, afterMove = false): boolean {
  return (
    owner.workspace === target.workspace &&
    owner.dragData.worktreeId === target.worktree &&
    (afterMove || owner.dragData.groupId === target.group) &&
    owner.dragData.unifiedTabId === target.unifiedTab &&
    owner.dragData.tabType === 'browser'
  )
}

function createDropOffer(
  request: BrowserTabDropEvent,
  ownerCurrent: (afterMove: boolean) => boolean
) {
  const initial = useAppStore.getState()
  let expected = initial
  let started = false
  let applying = false
  let mutationWrites = 0
  let invalidated = false
  const revision =
    request.target.environmentId === null
      ? null
      : captureWebSessionIntentOwner(request.target.environmentId).pairingRevision
  const unsubscribe = useAppStore.subscribe((state) => {
    if (
      state.activeWorktreeId !== initial.activeWorktreeId ||
      state.activeModal !== 'none' ||
      state.settings?.activeRuntimeEnvironmentId !== initial.settings?.activeRuntimeEnvironmentId ||
      state.browserTabsByWorktree[request.target.worktree] !==
        initial.browserTabsByWorktree[request.target.worktree]
    ) {
      invalidated = true
    }
    if (
      state.groupsByWorktree[request.target.worktree] !==
        expected.groupsByWorktree[request.target.worktree] ||
      state.unifiedTabsByWorktree[request.target.worktree] !==
        expected.unifiedTabsByWorktree[request.target.worktree] ||
      state.layoutByWorktree[request.target.worktree] !==
        expected.layoutByWorktree[request.target.worktree]
    ) {
      if (!applying || mutationWrites !== 0) {
        invalidated = true
      }
      mutationWrites += 1
      expected = state
    }
  })
  const current = (): void => {
    if (
      invalidated ||
      !ownerCurrent(started) ||
      Date.now() >= request.expiresAt ||
      (request.target.environmentId !== null &&
        captureWebSessionIntentOwner(request.target.environmentId).pairingRevision !== revision)
    ) {
      throw new Error('browser_tab_drop_stale_or_expired_effect_unknown')
    }
    readBrowserTabDropSource(request.target, !started)
  }
  return {
    dispose: unsubscribe,
    releaseOwner: () => {
      if (!started) {
        invalidated = true
        unsubscribe()
      }
    },
    perform: async (): Promise<BrowserTabDropReceipt> => {
      current()
      const source = readBrowserTabDropSource(request.target)
      const destination = resolveBrowserTabDropDestination(request.target, request.destination)
      const snapshot = captureTabDragActivationSnapshot(request.target.worktree)
      let completion: Promise<boolean> | undefined
      started = true
      applying = true
      let moved = false
      try {
        moved = commitResolvedTabDrop(source, destination, {
          worktreeId: request.target.worktree,
          dropUnifiedTab: initial.dropUnifiedTab,
          reorderUnifiedTabs: initial.reorderUnifiedTabs,
          observeMirror:
            request.target.environmentId === null
              ? undefined
              : (value) => {
                  completion = value
                },
          finishDrag: (restore, activeData) => {
            mutationWrites = 0
            if (restore) {
              restoreTabDragActivationSnapshot(request.target.worktree, snapshot)
            } else if (activeData) {
              restoreSourceGroupActiveTabAfterCrossGroupDrop({
                worktreeId: request.target.worktree,
                snapshot,
                sourceGroupId: activeData.groupId,
                movedTabId: activeData.unifiedTabId
              })
            }
          }
        })
      } finally {
        expected = useAppStore.getState()
        applying = false
      }
      if (!moved) {
        throw new Error('browser_tab_drop_no_change')
      }
      current()
      const acknowledged = completion === undefined ? false : await completion
      if (request.target.environmentId !== null && !acknowledged) {
        throw new Error('browser_tab_drop_host_ack_unknown_effect_unknown')
      }
      current()
      const state = useAppStore.getState()
      const tab = state.unifiedTabsByWorktree[request.target.worktree]?.find(
        (item) => item.id === source.unifiedTabId
      )
      const group = state.groupsByWorktree[request.target.worktree]?.find(
        (item) => item.id === tab?.groupId
      )
      if (!tab || !group?.tabOrder.includes(tab.id)) {
        throw new Error('browser_tab_drop_readback_failed_effect_unknown')
      }
      return {
        target: request.target,
        destination: request.destination,
        moved: true,
        group: group.id,
        order: [...group.tabOrder],
        activeGroup: state.activeGroupIdByWorktree[request.target.worktree] ?? null,
        activeTabs: Object.fromEntries(
          (state.groupsByWorktree[request.target.worktree] ?? []).map((item) => [
            item.id,
            item.activeTabId
          ])
        ),
        hostMoveAcknowledged: acknowledged,
        nativePointerVerified: false
      }
    }
  }
}

export function useBrowserTabDropCommands(owner: DropOwner): void {
  const latest = useRef(owner)
  useLayoutEffect(() => {
    latest.current = owner
  })
  useEffect(() => {
    const offers = new Set<ReturnType<typeof createDropOffer>>()
    const receive = (event: CustomEvent<BrowserTabDropEvent>): void => {
      const request = event.detail
      if (!matches(latest.current, request.target)) {
        return
      }
      try {
        readBrowserTabDropSource(request.target)
      } catch {
        return
      }
      const binding = createDropOffer(request, (afterMove) =>
        matches(latest.current, request.target, afterMove)
      )
      offers.add(binding)
      request.offer(binding.perform, () => {
        binding.dispose()
        offers.delete(binding)
      })
    }
    window.addEventListener(BROWSER_TAB_DROP_EVENT, receive)
    return () => {
      window.removeEventListener(BROWSER_TAB_DROP_EVENT, receive)
      offers.forEach((binding) => binding.releaseOwner())
    }
  }, [])
}
