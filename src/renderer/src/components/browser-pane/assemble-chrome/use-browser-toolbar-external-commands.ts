import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { BrowserToolbarExternalEvent } from '@/runtime/browser-toolbar-external-request'
import type { BrowserToolbarExternalState } from '../../../../../shared/rpc-contract/browser-toolbar-external-params'
type Owner = {
  page: string
  workspaceId: string
  worktreeId: string
  active: boolean
  url: string | null
  open: () => Promise<void>
}
type Pending = { check: () => void; finish: (error?: Error) => void }
export function useBrowserToolbarExternalCommands(owner: Owner): void {
  const latest = useRef(owner)
  const generation = useRef(0)
  const pending = useRef(new Set<Pending>())
  useLayoutEffect(() => {
    latest.current = owner
  })
  useLayoutEffect(() => {
    generation.current++
    for (const operation of pending.current) {
      operation.finish(new Error('browser_toolbar_external_owner_changed_effect_unknown'))
    }
  }, [owner.page, owner.workspaceId, owner.worktreeId, owner.active, owner.url])
  useEffect(() => {
    const operations = pending.current
    let mounted = true
    const receive = (raw: Event) => {
      if (
        !(raw instanceof BrowserToolbarExternalEvent) ||
        raw.command.page !== latest.current.page
      ) {
        return
      }
      const event = raw
      const before = latest.current
      const version = generation.current
      const pageBefore = findPage(useAppStore.getState().browserPagesByWorkspace, before.page)
      event.offers.push(
        () =>
          new Promise<BrowserToolbarExternalState>((resolve, reject) => {
            let settled = false
            let timer: ReturnType<typeof setTimeout> | undefined
            const check = () => {
              const current = latest.current
              const state = useAppStore.getState()
              const page = findPage(state.browserPagesByWorkspace, event.command.page)
              const target = event.command
              const group = state.groupsByWorktree[target.worktreeId]?.find(
                (entry) => entry.id === target.groupId
              )
              const tab = state.unifiedTabsByWorktree[target.worktreeId]?.find(
                (entry) => entry.id === group?.activeTabId
              )
              if (!mounted || generation.current !== version) {
                throw new Error('browser_toolbar_external_owner_changed_effect_unknown')
              }
              if (Date.now() >= event.expiresAt) {
                throw new Error('browser_toolbar_external_expired_effect_unknown')
              }
              if (
                !current.active ||
                current.page !== target.page ||
                current.workspaceId !== target.workspaceId ||
                current.worktreeId !== target.worktreeId ||
                current.url !== target.url ||
                !page ||
                !pageBefore ||
                page.url !== pageBefore.url ||
                page.workspaceId !== target.workspaceId ||
                page.worktreeId !== target.worktreeId ||
                page.docLocation ||
                page.browserRuntimeEnvironmentId ||
                state.remoteBrowserPageHandlesByPageId[page.id] ||
                state.activeWorktreeId !== target.worktreeId ||
                state.activeGroupIdByWorktree[target.worktreeId] !== target.groupId ||
                tab?.contentType !== 'browser' ||
                tab.entityId !== target.workspaceId ||
                !state.browserTabsByWorktree[target.worktreeId]?.some(
                  (workspace) =>
                    workspace.id === target.workspaceId && workspace.activePageId === target.page
                ) ||
                !state.settings ||
                state.settings.activeRuntimeEnvironmentId ||
                !state.persistedUIReady ||
                state.activeModal !== 'none' ||
                state.activeView !== 'terminal' ||
                target.executionHostId.startsWith('runtime:') ||
                getExecutionHostIdForWorktree(state, target.worktreeId) !== target.executionHostId
              ) {
                throw new Error('browser_toolbar_external_target_changed')
              }
            }
            const operation: Pending = {
              check,
              finish: (error) => {
                if (settled) {
                  return
                }
                settled = true
                if (timer !== undefined) {
                  clearTimeout(timer)
                }
                pending.current.delete(operation)
                if (error) {
                  reject(error)
                } else {
                  resolve({ ...event.command, requested: true, externalWindowVerified: false })
                }
              }
            }
            try {
              check()
              if (pending.current.size) {
                throw new Error('browser_toolbar_external_busy')
              }
              pending.current.add(operation)
              timer = setTimeout(
                () =>
                  operation.finish(new Error('browser_toolbar_external_expired_effect_unknown')),
                Math.max(0, event.expiresAt - Date.now())
              )
              void before.open().then(
                () => {
                  try {
                    check()
                    operation.finish()
                  } catch (error) {
                    operation.finish(error instanceof Error ? error : new Error(String(error)))
                  }
                },
                (error) =>
                  operation.finish(
                    error instanceof Error
                      ? error
                      : new Error('browser_toolbar_external_open_failed_effect_unknown')
                  )
              )
            } catch (error) {
              operation.finish(error instanceof Error ? error : new Error(String(error)))
            }
          })
      )
    }
    const unsubscribe = useAppStore.subscribe(() => {
      for (const operation of pending.current) {
        try {
          operation.check()
        } catch (error) {
          operation.finish(error instanceof Error ? error : new Error(String(error)))
        }
      }
    })
    window.addEventListener('orca:browser-toolbar-external', receive)
    return () => {
      mounted = false
      window.removeEventListener('orca:browser-toolbar-external', receive)
      unsubscribe()
      for (const operation of operations) {
        operation.finish(new Error('browser_toolbar_external_owner_changed_effect_unknown'))
      }
    }
  }, [])
}
