import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { getBrowserPageRuntimeEnvironmentId } from '../describe-page/browser-page-url-display'
import {
  getDriverForBrowserPage,
  onBrowserDriverChange,
  type BrowserDriverState
} from '@/lib/pane-manager/browser-mobile-driver-state'
import { BrowserTakeBackEvent } from '@/runtime/browser-take-back-request'
import type { BrowserTakeBackState } from '../../../../../shared/rpc-contract/browser-take-back-params'
export type BrowserTakeBackOwner = { page: string; worktreeId: string; workspaceId: string }
export type BrowserTakeBackVerification = {
  complete: () => Promise<void>
  isCurrent: () => boolean
}
type Owner = {
  identity?: BrowserTakeBackOwner
  driver: BrowserDriverState
  isPending: () => boolean
  takeBack: (verify: BrowserTakeBackVerification) => Promise<void>
}
export function useBrowserTakeBackCommands(owner: Owner): void {
  const current = useRef(owner)
  useLayoutEffect(() => {
    current.current = owner
  })
  useEffect(() => {
    if (!current.current.identity) {
      return
    }
    let mounted = true
    const requests = new Set<AbortController>()
    const receive = (event: Event) => {
      if (
        !(event instanceof BrowserTakeBackEvent) ||
        event.command.page !== current.current.identity?.page ||
        current.current.driver.kind !== 'mobile'
      ) {
        return
      }
      event.offers.push(async () => {
        const before = current.current
        const identity = before.identity
        const { command, expiresAt } = event
        const check = () => {
          const state = useAppStore.getState()
          const page = findPage(state.browserPagesByWorkspace, command.page)
          const latest = current.current.identity
          if (!mounted) {
            throw new Error('browser_take_back_disposed_effect_unknown')
          }
          if (Date.now() >= expiresAt) {
            throw new Error('browser_take_back_expired_effect_unknown')
          }
          if (
            !identity ||
            !latest ||
            !page ||
            latest.page !== command.page ||
            latest.worktreeId !== command.worktreeId ||
            latest.workspaceId !== identity.workspaceId ||
            page.workspaceId !== identity.workspaceId ||
            page.worktreeId !== command.worktreeId ||
            state.activeWorktreeId !== command.worktreeId ||
            !state.persistedUIReady ||
            !state.settings ||
            state.activeModal !== 'none' ||
            state.remoteBrowserPageHandlesByPageId[page.id] ||
            getBrowserPageRuntimeEnvironmentId(
              page,
              getRuntimeEnvironmentIdForWorktree(state, page.worktreeId)
            ) ||
            !state.browserTabsByWorktree[command.worktreeId]?.some(
              (tab) => tab.id === identity.workspaceId && tab.activePageId === page.id
            )
          ) {
            throw new Error('browser_take_back_target_changed_effect_unknown')
          }
        }
        check()
        const driver = getDriverForBrowserPage(command.page)
        if (before.isPending()) {
          throw new Error('browser_take_back_busy')
        }
        if (
          driver.kind !== 'mobile' ||
          driver.clientId !== command.expectedMobileClientId ||
          before.driver.kind !== 'mobile' ||
          before.driver.clientId !== command.expectedMobileClientId
        ) {
          throw new Error('browser_take_back_driver_changed')
        }
        const abort = new AbortController()
        requests.add(abort)
        const reason = () => {
          const value: unknown = abort.signal.reason
          return value instanceof Error
            ? value
            : new Error('browser_take_back_aborted_effect_unknown')
        }
        const waitForDesktop = (): Promise<void> =>
          new Promise((resolve, reject) => {
            let stopped = false
            const unsubs: (() => void)[] = []
            const stop = (error?: Error) => {
              if (stopped) {
                return
              }
              stopped = true
              for (const unsubscribe of unsubs) {
                unsubscribe()
              }
              abort.signal.removeEventListener('abort', aborted)
              if (error) {
                reject(error)
              } else {
                resolve()
              }
            }
            const aborted = () => stop(reason())
            const sample = () => {
              try {
                if (abort.signal.aborted) {
                  throw reason()
                }
                check()
                const next = getDriverForBrowserPage(command.page)
                if (next.kind === 'desktop') {
                  stop()
                } else if (
                  next.kind !== 'mobile' ||
                  next.clientId !== command.expectedMobileClientId
                ) {
                  throw new Error('browser_take_back_driver_changed_effect_unknown')
                }
              } catch (error) {
                stop(error instanceof Error ? error : new Error(String(error)))
              }
            }
            unsubs.push(
              onBrowserDriverChange(() => sample()),
              useAppStore.subscribe(() => sample())
            )
            abort.signal.addEventListener('abort', aborted, { once: true })
            sample()
          })
        let onAbort = () => {}
        const aborted = new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(reason())
          abort.signal.addEventListener('abort', onAbort, { once: true })
        })
        const watchTarget = () => {
          try {
            check()
          } catch (error) {
            abort.abort(error instanceof Error ? error : new Error(String(error)))
          }
        }
        const unsubscribeTarget = useAppStore.subscribe(watchTarget)
        const unsubscribeDriver = onBrowserDriverChange(() => {
          const next = getDriverForBrowserPage(command.page)
          if (
            next.kind !== 'desktop' &&
            (next.kind !== 'mobile' || next.clientId !== command.expectedMobileClientId)
          ) {
            abort.abort(new Error('browser_take_back_driver_changed_effect_unknown'))
          }
        })
        const timer = setTimeout(
          () => abort.abort(new Error('browser_take_back_expired_effect_unknown')),
          Math.max(0, expiresAt - Date.now())
        )
        try {
          await Promise.race([
            before.takeBack({
              complete: waitForDesktop,
              isCurrent: () => {
                try {
                  check()
                  return !abort.signal.aborted
                } catch {
                  return false
                }
              }
            }),
            aborted
          ])
          check()
          if (getDriverForBrowserPage(command.page).kind !== 'desktop' || !identity) {
            throw new Error('browser_take_back_effect_unverifiable')
          }
          const result: BrowserTakeBackState = {
            ...command,
            workspaceId: identity.workspaceId,
            driver: 'desktop',
            reclaimed: true
          }
          return result
        } finally {
          clearTimeout(timer)
          unsubscribeTarget()
          unsubscribeDriver()
          abort.signal.removeEventListener('abort', onAbort)
          requests.delete(abort)
        }
      })
    }
    window.addEventListener('orca:browser-take-back', receive)
    return () => {
      mounted = false
      window.removeEventListener('orca:browser-take-back', receive)
      for (const request of requests) {
        request.abort(new Error('browser_take_back_disposed_effect_unknown'))
      }
    }
  }, [owner.identity?.page])
}
