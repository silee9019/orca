import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { getBrowserPageRuntimeEnvironmentId } from '../describe-page/browser-page-url-display'
import { BrowserBannerEvent } from '@/runtime/browser-banner-request'
import type { BrowserBannerState } from '../../../../../shared/rpc-contract/browser-banner-params'
type Owner = {
  identity?: { page: string; isActive: boolean }
  worktreeId: string
  resourceNotice: string | null
  hasPendingAnnotation: boolean
  grabState: BrowserBannerState['grabState']
  sendMenuOpen: boolean
  canSend: boolean
  dismissResource: () => void
  cancelGrab: () => Promise<boolean>
  setSendOpen: (open: boolean) => void
}
type Pending = {
  event: BrowserBannerEvent
  done: boolean
  cancelAccepted: boolean
  finish: (error?: Error, state?: BrowserBannerState) => void
  check: () => void
}
export function useBrowserBannerCommands(owner: Owner): void {
  const current = useRef(owner)
  const pending = useRef<Pending | null>(null)
  const [, update] = useState(0)
  const checkPending = () => {
    const operation = pending.current
    if (!operation) {
      return
    }
    try {
      operation.check()
    } catch (error) {
      operation.finish(error instanceof Error ? error : new Error(String(error)))
    }
  }
  useLayoutEffect(() => {
    current.current = owner
    checkPending()
  })
  const snapshot = (event: BrowserBannerEvent): BrowserBannerState => ({
    page: event.command.page,
    worktreeId: event.command.worktreeId,
    hasResourceNotice: !!current.current.resourceNotice,
    hasPendingAnnotation: current.current.hasPendingAnnotation,
    grabState: current.current.grabState,
    sendMenuOpen: current.current.sendMenuOpen
  })
  useEffect(() => {
    const operation = pending.current
    if (!operation) {
      return
    }
    try {
      operation.check()
      if (!operation.done) {
        return
      }
      const state = snapshot(operation.event)
      const action = operation.event.command.action
      if (
        (action === 'resource-dismiss' && state.hasResourceNotice) ||
        (action === 'cancel-grab' &&
          (state.hasPendingAnnotation ||
            state.grabState !== 'idle' ||
            !operation.cancelAccepted)) ||
        (action === 'send-menu-open' && !state.sendMenuOpen) ||
        (action === 'send-menu-close' && state.sendMenuOpen)
      ) {
        throw new Error('browser_banner_effect_unknown')
      }
      operation.finish(undefined, {
        ...state,
        ...(operation.cancelAccepted ? { cancellationAccepted: true as const } : {})
      })
    } catch (error) {
      operation.finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
  useEffect(() => {
    let mounted = true
    const receive = (raw: Event) => {
      if (!(raw instanceof BrowserBannerEvent)) {
        return
      }
      const event = raw
      const before = current.current
      if (
        !before.identity?.isActive ||
        event.command.page !== before.identity.page ||
        event.command.worktreeId !== before.worktreeId ||
        (!before.resourceNotice && before.grabState === 'idle' && !pending.current)
      ) {
        return
      }
      const pageBefore = findPage(
        useAppStore.getState().browserPagesByWorkspace,
        event.command.page
      )
      event.offers.push(async () => {
        let started = false
        const check = () => {
          const latest = current.current
          const state = useAppStore.getState()
          const page = findPage(state.browserPagesByWorkspace, event.command.page)
          if (!started && current.current !== before) {
            throw new Error('browser_banner_owner_changed')
          }
          if (!mounted) {
            throw new Error('browser_banner_disposed_effect_unknown')
          }
          if (Date.now() >= event.expiresAt) {
            throw new Error('browser_banner_expired_effect_unknown')
          }
          const groupId = state.activeGroupIdByWorktree[event.command.worktreeId]
          const group = state.groupsByWorktree[event.command.worktreeId]?.find(
            (entry) => entry.id === groupId
          )
          const tab = state.unifiedTabsByWorktree[event.command.worktreeId]?.find(
            (entry) => entry.id === group?.activeTabId
          )
          if (
            !latest.identity?.isActive ||
            latest.identity.page !== event.command.page ||
            latest.worktreeId !== event.command.worktreeId ||
            !page ||
            !pageBefore ||
            page.workspaceId !== pageBefore.workspaceId ||
            page.url !== pageBefore.url ||
            page.worktreeId !== event.command.worktreeId ||
            state.activeWorktreeId !== event.command.worktreeId ||
            !state.settings ||
            !state.persistedUIReady ||
            state.activeModal !== 'none' ||
            tab?.contentType !== 'browser' ||
            tab.entityId !== page.workspaceId ||
            !state.browserTabsByWorktree[event.command.worktreeId]?.some(
              (workspace) => workspace.id === page.workspaceId && workspace.activePageId === page.id
            ) ||
            state.remoteBrowserPageHandlesByPageId[page.id] ||
            getBrowserPageRuntimeEnvironmentId(
              page,
              getRuntimeEnvironmentIdForWorktree(state, page.worktreeId)
            )
          ) {
            throw new Error('browser_banner_target_changed_effect_unknown')
          }
        }
        check()
        if (event.command.action === 'status') {
          return snapshot(event)
        }
        if (pending.current) {
          throw new Error('browser_banner_busy')
        }
        if (
          (event.command.action === 'resource-dismiss' && !before.resourceNotice) ||
          (event.command.action === 'cancel-grab' && before.grabState === 'idle') ||
          ((event.command.action === 'send-menu-open' ||
            event.command.action === 'send-menu-close') &&
            !before.canSend)
        ) {
          throw new Error('browser_banner_action_unavailable')
        }
        return new Promise<BrowserBannerState>((resolve, reject) => {
          const operation: Pending = {
            event,
            done: false,
            cancelAccepted: false,
            check,
            finish: (error, state) => {
              if (pending.current !== operation) {
                return
              }
              pending.current = null
              clearTimeout(timer)
              if (error) {
                reject(error)
              } else if (state) {
                resolve(state)
              } else {
                reject(new Error('browser_banner_effect_unknown'))
              }
            }
          }
          const timer = setTimeout(
            () => operation.finish(new Error('browser_banner_expired_effect_unknown')),
            Math.max(0, event.expiresAt - Date.now())
          )
          pending.current = operation
          try {
            check()
            started = true
            if (event.command.action === 'cancel-grab') {
              void before
                .cancelGrab()
                .then((accepted) => {
                  if (pending.current !== operation) {
                    return
                  }
                  check()
                  if (!accepted) {
                    throw new Error('browser_banner_cancel_refused_effect_unknown')
                  }
                  operation.cancelAccepted = true
                  operation.done = true
                  update((value) => value + 1)
                })
                .catch((error) =>
                  operation.finish(error instanceof Error ? error : new Error(String(error)))
                )
            } else {
              if (event.command.action === 'resource-dismiss') {
                before.dismissResource()
              } else {
                before.setSendOpen(event.command.action === 'send-menu-open')
              }
              operation.done = true
              update((value) => value + 1)
            }
          } catch (error) {
            operation.finish(error instanceof Error ? error : new Error(String(error)))
          }
        })
      })
    }
    const unsubscribe = useAppStore.subscribe(checkPending)
    window.addEventListener('orca:browser-banner', receive)
    return () => {
      mounted = false
      unsubscribe()
      window.removeEventListener('orca:browser-banner', receive)
      pending.current?.finish(new Error('browser_banner_disposed_effect_unknown'))
    }
  }, [])
}
