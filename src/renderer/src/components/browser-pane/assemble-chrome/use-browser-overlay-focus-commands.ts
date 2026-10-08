import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { BrowserOverlayFocusEvent } from '@/runtime/browser-overlay-focus-request'
type Owner = {
  worktreeId: string
  workspaceId: string
  groupId?: string
  isActive: boolean
  focus: () => void
}
export function useBrowserOverlayFocusCommands(owner: Owner): void {
  const latest = useRef(owner)
  useLayoutEffect(() => {
    latest.current = owner
  })
  useEffect(() => {
    let mounted = true
    const receive = (raw: Event) => {
      if (!(raw instanceof BrowserOverlayFocusEvent)) {
        return
      }
      const event = raw
      const current = latest.current
      if (
        !current.isActive ||
        current.workspaceId !== event.command.workspaceId ||
        current.worktreeId !== event.command.worktreeId
      ) {
        return
      }
      event.offers.push(() => {
        const target = event.command
        const state = useAppStore.getState()
        const owner = latest.current
        if (!mounted) {
          throw new Error('browser_overlay_focus_disposed')
        }
        if (Date.now() >= event.expiresAt) {
          throw new Error('browser_overlay_focus_expired')
        }
        const group = state.groupsByWorktree[target.worktreeId]?.find(
          (entry) => entry.id === target.groupId
        )
        const tab = state.unifiedTabsByWorktree[target.worktreeId]?.find(
          (entry) => entry.id === group?.activeTabId
        )
        if (
          !state.settings ||
          !state.persistedUIReady ||
          state.activeModal !== 'none' ||
          state.activeWorktreeId !== target.worktreeId ||
          !owner.isActive ||
          owner.groupId !== target.groupId ||
          owner.workspaceId !== target.workspaceId ||
          owner.worktreeId !== target.worktreeId ||
          !group ||
          !tab ||
          tab.contentType !== 'browser' ||
          tab.entityId !== target.workspaceId ||
          tab.groupId !== target.groupId ||
          !group.tabOrder.includes(tab.id) ||
          getResolvedExecutionHostIdForWorktree(state, target.worktreeId) !== target.executionHostId
        ) {
          throw new Error('browser_overlay_focus_target_changed')
        }
        owner.focus()
        const applied = useAppStore.getState()
        if (
          applied.activeWorktreeId !== target.worktreeId ||
          applied.activeGroupIdByWorktree[target.worktreeId] !== target.groupId ||
          applied.groupsByWorktree[target.worktreeId]?.find((entry) => entry.id === target.groupId)
            ?.activeTabId !== tab.id
        ) {
          throw new Error('browser_overlay_focus_effect_unknown')
        }
        return { ...target, activeTabId: tab.id, focused: true as const }
      })
    }
    window.addEventListener('orca:browser-overlay-focus', receive)
    return () => {
      mounted = false
      window.removeEventListener('orca:browser-overlay-focus', receive)
    }
  }, [])
}
