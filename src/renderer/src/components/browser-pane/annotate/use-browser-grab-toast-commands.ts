import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { BrowserGrabToastEvent } from '@/runtime/browser-grab-toast-request'
import type { BrowserGrabToastState } from '../../../../../shared/rpc-contract/browser-grab-toast-params'
import type { BrowserPageGrabToastState } from '../describe-page/browser-page-types'
export type BrowserGrabToastOwner = { page: string; active: boolean }
type Owner = {
  identity?: BrowserGrabToastOwner
  toast: BrowserPageGrabToastState
  feedbackMessage: string
  copy: (verified: boolean, stillCurrent: () => boolean) => Promise<boolean>
}
type Pending = { check: () => void; finish: (error?: Error) => void; copied: boolean }
export function useBrowserGrabToastCommands(owner: Owner): void {
  const enabled = owner.identity !== undefined
  const latest = useRef(owner)
  const token = useId()
  const capture = useRef({
    payload: owner.toast.payload,
    image: owner.toast.payload?.screenshot?.dataUrl,
    generation: 0
  })
  const pending = useRef<Pending | null>(null)
  const checkPending = () => {
    try {
      pending.current?.check()
    } catch (error) {
      pending.current?.finish(error instanceof Error ? error : new Error(String(error)))
    }
  }
  useLayoutEffect(() => {
    latest.current = owner
    const payload = owner.toast.payload
    const image = payload?.screenshot?.dataUrl
    if (capture.current.payload !== payload || capture.current.image !== image) {
      capture.current = { payload, image, generation: capture.current.generation + 1 }
    }
    checkPending()
  })
  useEffect(() => {
    checkPending()
    if (
      pending.current?.copied &&
      latest.current.toast.message === latest.current.feedbackMessage
    ) {
      pending.current.finish()
    }
  })
  useEffect(() => {
    if (!enabled) {
      return
    }
    let mounted = true
    const receive = (raw: Event) => {
      if (
        !(raw instanceof BrowserGrabToastEvent) ||
        latest.current.identity?.page !== raw.command.page
      ) {
        return
      }
      const event = raw
      const before = capture.current
      const nonce = `${token}:${before.generation}`
      const pageBefore = findPage(
        useAppStore.getState().browserPagesByWorkspace,
        event.command.page
      )
      event.offers.push(async () => {
        const command = event.command
        const check = () => {
          const state = useAppStore.getState(),
            current = latest.current
          const page = findPage(state.browserPagesByWorkspace, command.page)
          const group = state.groupsByWorktree[command.worktreeId]?.find(
            (entry) => entry.id === command.groupId
          )
          const tab = state.unifiedTabsByWorktree[command.worktreeId]?.find(
            (entry) => entry.id === group?.activeTabId
          )
          if (
            !mounted ||
            Date.now() >= event.expiresAt ||
            !current.identity?.active ||
            current.identity.page !== command.page ||
            capture.current !== before ||
            current.toast.payload !== before.payload ||
            current.toast.payload?.screenshot?.dataUrl !== before.image ||
            !before.image?.startsWith('data:image/png;base64,') ||
            !page ||
            !pageBefore ||
            page.url !== pageBefore.url ||
            page.workspaceId !== command.workspaceId ||
            page.worktreeId !== command.worktreeId ||
            state.activeWorktreeId !== command.worktreeId ||
            state.activeGroupIdByWorktree[command.worktreeId] !== command.groupId ||
            state.activeModal !== 'none' ||
            state.activeView !== 'terminal' ||
            !state.settings ||
            !state.persistedUIReady ||
            tab?.contentType !== 'browser' ||
            tab.entityId !== command.workspaceId ||
            !group?.tabOrder.includes(tab.id) ||
            !state.browserTabsByWorktree[command.worktreeId]?.some(
              (workspace) =>
                workspace.id === command.workspaceId && workspace.activePageId === command.page
            ) ||
            state.remoteBrowserPageHandlesByPageId[command.page] ||
            getResolvedExecutionHostIdForWorktree(state, command.worktreeId) !==
              command.executionHostId
          ) {
            throw new Error('browser_grab_toast_target_changed_effect_unknown')
          }
        }
        const snapshot = (copied: boolean): BrowserGrabToastState => ({
          page: command.page,
          worktreeId: command.worktreeId,
          workspaceId: command.workspaceId,
          groupId: command.groupId,
          executionHostId: command.executionHostId,
          toastId: nonce,
          hasScreenshot: true,
          copied
        })
        check()
        if (pending.current) {
          throw new Error('browser_grab_toast_busy')
        }
        if (command.action === 'status') {
          return snapshot(false)
        }
        if (command.toastId !== nonce) {
          throw new Error('browser_grab_toast_capture_changed')
        }
        return new Promise<BrowserGrabToastState>((resolve, reject) => {
          const operation: Pending = {
            check,
            copied: false,
            finish: (error) => {
              if (pending.current !== operation) {
                return
              }
              pending.current = null
              clearTimeout(timer)
              if (error) {
                reject(error)
              } else {
                resolve(snapshot(true))
              }
            }
          }
          const timer = setTimeout(
            () => operation.finish(new Error('browser_grab_toast_expired_effect_unknown')),
            Math.max(0, event.expiresAt - Date.now())
          )
          pending.current = operation
          void latest.current
            .copy(true, () => {
              checkPending()
              return pending.current === operation
            })
            .then(
              (accepted) => {
                if (pending.current !== operation) {
                  return
                }
                if (!accepted) {
                  operation.finish(new Error('browser_grab_toast_copy_failed_effect_unknown'))
                } else {
                  operation.copied = true
                  if (latest.current.toast.message === latest.current.feedbackMessage) {
                    operation.finish()
                  }
                }
              },
              () => operation.finish(new Error('browser_grab_toast_copy_failed_effect_unknown'))
            )
        })
      })
    }
    const unsubscribe = useAppStore.subscribe(checkPending)
    window.addEventListener('orca:browser-grab-toast', receive)
    return () => {
      mounted = false
      unsubscribe()
      window.removeEventListener('orca:browser-grab-toast', receive)
      pending.current?.finish(new Error('browser_grab_toast_disposed_effect_unknown'))
    }
  }, [token, enabled])
}
