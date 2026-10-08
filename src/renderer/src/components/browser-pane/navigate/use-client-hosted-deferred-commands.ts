import { useEffectEvent, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { redactKagiSessionToken } from '../../../../../shared/browser-url'
import {
  BROWSER_CLIENT_DEFERRED_EVENT,
  type BrowserClientDeferredEvent
} from '@/runtime/browser-client-deferred-request'
import { isBrowserClientStagedTargetCurrent } from '@/runtime/browser-client-staged-viewer-target'
import type { RemoteBrowserPageHandle } from '@/store/slices/browser/browser-slice-contract'
import { readBrowserPageDeferredNavigation } from './browser-page-deferred-navigation'
import type { useClientHostedNavigationCommands } from './use-client-hosted-navigation-commands'
export function useClientHostedDeferredCommands(
  params: Parameters<typeof useClientHostedNavigationCommands>[0]
): void {
  const latest = useRef(params)
  latest.current = params
  const epoch = useRef(0)
  const offeredTarget = useRef<BrowserClientDeferredEvent['target'] | null>(null)
  const offeredHandle = useRef<RemoteBrowserPageHandle | undefined>(undefined)
  const onCommand = useEffectEvent((request: BrowserClientDeferredEvent) => {
    const { target } = request
    if (
      !params.isActive ||
      params.placement !== null ||
      params.page !== target.page ||
      params.worktreeId !== target.worktreeId ||
      params.environmentId !== target.environmentId ||
      !isBrowserClientStagedTargetCurrent(target)
    ) {
      return
    }
    offeredTarget.current = target
    offeredHandle.current = useAppStore.getState().remoteBrowserPageHandlesByPageId[target.page]
    const handle = offeredHandle.current
    const offeredEpoch = epoch.current
    request.offer(() => {
      const owner = latest.current
      const current = (): boolean => {
        const owner = latest.current
        return (
          offeredEpoch === epoch.current &&
          owner.isActive &&
          !owner.unavailable &&
          owner.placement === null &&
          owner.page === target.page &&
          owner.worktreeId === target.worktreeId &&
          owner.environmentId === target.environmentId &&
          owner.webviewRef.current === null &&
          isBrowserClientStagedTargetCurrent(target) &&
          useAppStore.getState().remoteBrowserPageHandlesByPageId[target.page] === handle &&
          Date.now() < request.expiresAt
        )
      }
      if (!current()) {
        request.finish(new Error('browser_client_deferred_owner_changed'))
        return
      }
      let observed = false
      try {
        owner.navigate(request.value, undefined, undefined, (url) => {
          observed = true
          const queued = readBrowserPageDeferredNavigation(target.page)
          if (!current() || !queued || queued.url !== url) {
            request.finish(new Error('browser_client_deferred_effect_unknown'))
            return
          }
          request.finish(undefined, {
            target,
            queued: true,
            completionObserved: false,
            hostPlacementKnown: false,
            url: redactKagiSessionToken(url),
            queuedUntil: queued.expiresAt
          })
        })
        if (!observed) {
          request.finish(new Error('browser_client_deferred_not_observed'))
        }
      } catch (error) {
        request.finish(
          error instanceof Error ? error : new Error('browser_client_deferred_effect_unknown')
        )
      }
    })
  })
  useLayoutEffect(() => {
    const unsubscribe = useAppStore.subscribe((state) => {
      const target = offeredTarget.current
      if (
        target &&
        (!isBrowserClientStagedTargetCurrent(target) ||
          state.remoteBrowserPageHandlesByPageId[target.page] !== offeredHandle.current)
      ) {
        epoch.current += 1
      }
    })
    const listener = (event: WindowEventMap['orca:browser-client-deferred-command']): void =>
      onCommand(event.detail)
    window.addEventListener(BROWSER_CLIENT_DEFERRED_EVENT, listener)
    return () => {
      epoch.current += 1
      unsubscribe()
      offeredTarget.current = null
      offeredHandle.current = undefined
      window.removeEventListener(BROWSER_CLIENT_DEFERRED_EVENT, listener)
    }
  }, [params.page, params.worktreeId, params.environmentId, params.placement, params.isActive])
}
