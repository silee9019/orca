import { sameRuntimeBrowserPlacement } from '../../../../shared/runtime-browser-placement'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { matchesBrowserClientPageCommandTarget } from '@/runtime/browser-client-page-command-target'
import { BrowserServerReopenEvent } from '@/runtime/browser-server-reopen-request'
import type { RuntimeBrowserClientPlacement } from '../../../../shared/runtime-browser-placement'
import type { BrowserServerReopenState } from '../../../../shared/rpc-contract/browser-server-reopen-params'
import type { WebRuntimeBrowserCreationObserver } from '@/runtime/web-runtime-browser-creation-receipt'
export type BrowserServerReopenOwner = {
  page: string
  active: boolean
  clientPlacement: RuntimeBrowserClientPlacement
}
type Owner = {
  identity?: BrowserServerReopenOwner
  environmentId: string
  worktreeId: string
  url: string | null | undefined
  perform: (observer?: WebRuntimeBrowserCreationObserver) => Promise<boolean>
}
type Pending = {
  handedOff: boolean
  check: () => void
  finish: (error?: Error, state?: BrowserServerReopenState) => void
}
export function useBrowserServerReopenCommands(owner: Owner): void {
  const generation = useRef(0)
  const latest = useRef(owner)
  const pending = useRef<Pending | null>(null)
  const enabled = owner.identity !== undefined
  const checkPending = () => {
    const operation = pending.current
    if (!operation || operation.handedOff) {
      return
    }
    try {
      operation.check()
    } catch (error) {
      operation.finish(error instanceof Error ? error : new Error(String(error)))
    }
  }
  useLayoutEffect(() => {
    const before = latest.current
    if (
      before.identity?.page !== owner.identity?.page ||
      before.identity?.active !== owner.identity?.active ||
      before.environmentId !== owner.environmentId ||
      before.worktreeId !== owner.worktreeId ||
      before.url !== owner.url ||
      (before.identity && owner.identity
        ? !sameRuntimeBrowserPlacement(
            before.identity.clientPlacement,
            owner.identity.clientPlacement
          )
        : before.identity !== owner.identity)
    ) {
      generation.current += 1
    }
    latest.current = owner
    checkPending()
  })
  useEffect(() => {
    if (!enabled) {
      return
    }
    let mounted = true
    const receive = (raw: Event) => {
      if (
        !(raw instanceof BrowserServerReopenEvent) ||
        latest.current.identity?.page !== raw.command.page
      ) {
        return
      }
      const event = raw,
        before = latest.current
      const offeredGeneration = generation.current
      event.offers.push(async () => {
        const target = event.command
        const check = () => {
          const state = useAppStore.getState(),
            current = latest.current
          const page = findPage(state.browserPagesByWorkspace, target.page)
          const group = state.groupsByWorktree[target.worktreeId]?.find(
            (entry) => entry.id === target.groupId
          )
          const tab = state.unifiedTabsByWorktree[target.worktreeId]?.find(
            (entry) => entry.id === group?.activeTabId
          )
          if (
            generation.current !== offeredGeneration ||
            !mounted ||
            Date.now() >= event.expiresAt ||
            !current.identity?.active ||
            current.identity.page !== target.page ||
            current.environmentId !== target.environmentId ||
            current.worktreeId !== target.worktreeId ||
            current.url !== before.url ||
            !page ||
            page.url !== before.url ||
            page.worktreeId !== target.worktreeId ||
            page.workspaceId !== target.workspaceId ||
            page.browserRuntimeEnvironmentId !== target.environmentId ||
            state.activeWorktreeId !== target.worktreeId ||
            state.activeGroupIdByWorktree[target.worktreeId] !== target.groupId ||
            state.activeModal !== 'none' ||
            state.activeView !== 'terminal' ||
            !state.settings ||
            !state.persistedUIReady ||
            tab?.contentType !== 'browser' ||
            tab.entityId !== target.workspaceId ||
            tab.executionHostId !== target.executionHostId ||
            !group?.tabOrder.includes(tab.id) ||
            !state.browserTabsByWorktree[target.worktreeId]?.some(
              (workspace) =>
                workspace.id === target.workspaceId && workspace.activePageId === target.page
            ) ||
            !matchesBrowserClientPageCommandTarget(
              state.remoteBrowserPageHandlesByPageId[target.page],
              target.environmentId,
              target.clientTarget,
              current.identity.clientPlacement
            )
          ) {
            throw new Error('browser_server_reopen_target_changed')
          }
        }
        check()
        if (pending.current) {
          throw new Error('browser_server_reopen_busy')
        }
        return new Promise<BrowserServerReopenState>((resolve, reject) => {
          let receipt: BrowserServerReopenState | undefined
          const operation: Pending = {
            handedOff: false,
            check,
            finish: (error, state) => {
              if (pending.current !== operation) {
                return
              }
              pending.current = null
              clearTimeout(timer)
              const failure =
                error ??
                (state && Date.now() >= event.expiresAt
                  ? new Error('browser_server_reopen_expired_effect_unknown')
                  : undefined)
              if (failure) {
                reject(failure)
              } else if (state) {
                resolve(state)
              } else {
                reject(new Error('browser_server_reopen_effect_unknown'))
              }
            }
          }
          const timer = setTimeout(
            () => operation.finish(new Error('browser_server_reopen_expired_effect_unknown')),
            Math.max(0, event.expiresAt - Date.now())
          )
          pending.current = operation
          void before
            .perform((message) => {
              if (pending.current !== operation) {
                return
              }
              if (message.phase === 'started') {
                operation.handedOff = true
                return
              }
              if (
                message.phase !== 'materialized' ||
                !operation.handedOff ||
                message.environmentId !== target.environmentId ||
                message.worktreeId !== target.worktreeId ||
                message.remotePageId === target.clientTarget.remotePageId
              ) {
                operation.finish(new Error('browser_server_reopen_creation_changed_effect_unknown'))
                return
              }
              receipt = {
                page: target.page,
                worktreeId: target.worktreeId,
                workspaceId: target.workspaceId,
                groupId: target.groupId,
                executionHostId: target.executionHostId,
                environmentId: target.environmentId,
                created: true,
                createdRemotePageId: message.remotePageId
              }
            })
            .then(
              (created) => {
                if (pending.current !== operation) {
                  return
                }
                if (!created || !receipt) {
                  operation.finish(new Error('browser_server_reopen_failed_effect_unknown'))
                } else {
                  operation.finish(undefined, receipt)
                }
              },
              () => operation.finish(new Error('browser_server_reopen_failed_effect_unknown'))
            )
        })
      })
    }
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (
        state.browserPagesByWorkspace !== previous.browserPagesByWorkspace ||
        state.browserTabsByWorktree !== previous.browserTabsByWorktree ||
        state.groupsByWorktree !== previous.groupsByWorktree ||
        state.unifiedTabsByWorktree !== previous.unifiedTabsByWorktree ||
        state.remoteBrowserPageHandlesByPageId !== previous.remoteBrowserPageHandlesByPageId ||
        state.activeWorktreeId !== previous.activeWorktreeId ||
        state.activeWorkspaceExecutionHostId !== previous.activeWorkspaceExecutionHostId ||
        state.activeGroupIdByWorktree !== previous.activeGroupIdByWorktree ||
        state.activeView !== previous.activeView ||
        state.activeModal !== previous.activeModal ||
        state.persistedUIReady !== previous.persistedUIReady
      ) {
        generation.current += 1
      }
      checkPending()
    })
    window.addEventListener('orca:browser-server-reopen', receive)
    return () => {
      mounted = false
      unsubscribe()
      window.removeEventListener('orca:browser-server-reopen', receive)
      if (pending.current && !pending.current.handedOff) {
        pending.current.finish(new Error('browser_server_reopen_disposed'))
      }
    }
  }, [enabled])
}
