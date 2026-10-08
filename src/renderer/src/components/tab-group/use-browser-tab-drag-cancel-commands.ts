import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { useAppStore } from '@/store'
import { captureWebSessionIntentOwner } from '@/runtime/web-runtime-session-environment'
import {
  BROWSER_TAB_DRAG_CANCEL_EVENT,
  type BrowserTabDragCancelEvent
} from '@/runtime/browser-tab-drag-cancel-request'
import type { BrowserTabDragCancelReceipt } from '../../../../shared/rpc-contract/browser-tab-drop-params'
import { isWebviewDragPassthroughActive } from '@/components/browser-pane/host-guest/webview-drag-passthrough'
import { readBrowserTabDropSource } from '../tab-bar/browser-tab-drop-target'
import type { TabDragItemData } from './tab-drag-data'
import type { TabDragActivationSnapshot } from './tab-drag-preview-activation'

type CancelOwner = {
  enabled: boolean
  worktreeId: string
  activeDrag: TabDragItemData | null
  snapshot: RefObject<TabDragActivationSnapshot | null>
  active: RefObject<boolean>
  epoch: RefObject<number>
  hovered: boolean
  cancel: () => void
  resources: () => { passthroughHeld: boolean; missedEndInstalled: boolean }
}
function matches(owner: CancelOwner, event: BrowserTabDragCancelEvent): boolean {
  const source = owner.activeDrag
  return (
    owner.enabled &&
    owner.active.current &&
    source?.tabType === 'browser' &&
    owner.worktreeId === event.target.worktree &&
    source.worktreeId === event.target.worktree &&
    source.visibleTabId === event.target.workspace &&
    source.unifiedTabId === event.target.unifiedTab &&
    source.groupId === event.target.group &&
    owner.snapshot.current !== null
  )
}
function bindCancel(event: BrowserTabDragCancelEvent, latest: () => CancelOwner) {
  const owner = latest()
  const epoch = owner.epoch.current
  const drag = owner.activeDrag
  const snapshot = owner.snapshot.current
  const initial = useAppStore.getState()
  const revision =
    event.target.environmentId === null
      ? null
      : captureWebSessionIntentOwner(event.target.environmentId).pairingRevision
  let invalidated = false
  let applying = false
  let writes = 0
  let started = false
  let resolve: ((receipt: BrowserTabDragCancelReceipt) => void) | undefined
  let reject: ((error: Error) => void) | undefined
  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (
      state.activeWorktreeId !== initial.activeWorktreeId ||
      state.activeModal !== 'none' ||
      state.settings?.activeRuntimeEnvironmentId !== initial.settings?.activeRuntimeEnvironmentId ||
      state.browserTabsByWorktree[event.target.worktree] !==
        initial.browserTabsByWorktree[event.target.worktree] ||
      state.unifiedTabsByWorktree[event.target.worktree] !==
        initial.unifiedTabsByWorktree[event.target.worktree] ||
      state.layoutByWorktree[event.target.worktree] !==
        initial.layoutByWorktree[event.target.worktree]
    ) {
      invalidated = true
    }
    if (
      state.groupsByWorktree[event.target.worktree] !==
        previous.groupsByWorktree[event.target.worktree] ||
      state.activeGroupIdByWorktree[event.target.worktree] !==
        previous.activeGroupIdByWorktree[event.target.worktree]
    ) {
      if (!applying || writes !== 0) {
        invalidated = true
      }
      writes += 1
    }
  })
  const current = (): void => {
    const now = latest()
    if (
      invalidated ||
      !now.enabled ||
      now.epoch.current !== epoch ||
      now.worktreeId !== event.target.worktree ||
      Date.now() >= event.expiresAt ||
      (event.target.environmentId !== null &&
        captureWebSessionIntentOwner(event.target.environmentId).pairingRevision !== revision)
    ) {
      throw new Error('browser_tab_drag_cancel_stale_or_expired_effect_unknown')
    }
    readBrowserTabDropSource(event.target)
  }
  return {
    invalidate: () => {
      invalidated = true
    },
    dispose: () => {
      unsubscribe()
      reject?.(new Error('browser_tab_drag_cancel_disposed_effect_unknown'))
    },
    perform: (): Promise<BrowserTabDragCancelReceipt> =>
      new Promise((done, fail) => {
        try {
          current()
          if (
            !matches(latest(), event) ||
            latest().activeDrag !== drag ||
            latest().snapshot.current !== snapshot
          ) {
            throw new Error('browser_tab_drag_cancel_gesture_replaced')
          }
          resolve = done
          reject = fail
          started = true
          applying = true
          owner.cancel()
        } catch (error) {
          fail(error)
        } finally {
          applying = false
        }
      }),
    commit: (): void => {
      if (!started || !resolve || !snapshot) {
        return
      }
      try {
        current()
        const now = latest()
        const resources = now.resources()
        const state = useAppStore.getState()
        const groups = state.groupsByWorktree[event.target.worktree] ?? []
        if (
          now.active.current ||
          now.activeDrag !== null ||
          now.snapshot.current !== null ||
          now.hovered ||
          resources.passthroughHeld ||
          resources.missedEndInstalled ||
          (state.activeGroupIdByWorktree[event.target.worktree] ?? null) !==
            snapshot.activeGroupId ||
          groups.some(
            (group) => group.activeTabId !== (snapshot.activeTabIdByGroup[group.id] ?? null)
          )
        ) {
          throw new Error('browser_tab_drag_cancel_readback_failed_effect_unknown')
        }
        resolve({
          target: event.target,
          cancelled: true,
          dragActive: false,
          hoverVisible: false,
          ownerPassthroughHeld: false,
          ownerMissedEndFallbackInstalled: false,
          passthroughActiveAfter: isWebviewDragPassthroughActive(),
          activeGroup: snapshot.activeGroupId,
          activeTabs: Object.fromEntries(groups.map((group) => [group.id, group.activeTabId])),
          nativePointerVerified: false
        })
        resolve = undefined
        reject = undefined
      } catch (error) {
        reject?.(error instanceof Error ? error : new Error('browser_tab_drag_cancel_failed'))
      }
    }
  }
}
export function useBrowserTabDragCancelCommands(owner: CancelOwner): void {
  const latest = useRef(owner)
  const bindings = useRef(new Set<ReturnType<typeof bindCancel>>())
  useLayoutEffect(() => {
    if (
      latest.current.enabled !== owner.enabled ||
      latest.current.worktreeId !== owner.worktreeId
    ) {
      bindings.current.forEach((binding) => binding.invalidate())
    }
    latest.current = owner
    bindings.current.forEach((binding) => binding.commit())
  })
  useEffect(() => {
    const active = bindings.current
    const receive = (event: CustomEvent<BrowserTabDragCancelEvent>): void => {
      if (!matches(latest.current, event.detail)) {
        return
      }
      try {
        readBrowserTabDropSource(event.detail.target)
      } catch {
        return
      }
      const binding = bindCancel(event.detail, () => latest.current)
      active.add(binding)
      event.detail.offer(binding.perform, () => {
        binding.dispose()
        active.delete(binding)
      })
    }
    window.addEventListener(BROWSER_TAB_DRAG_CANCEL_EVENT, receive)
    return () => {
      window.removeEventListener(BROWSER_TAB_DRAG_CANCEL_EVENT, receive)
      active.forEach((binding) => binding.dispose())
      active.clear()
    }
  }, [])
}
