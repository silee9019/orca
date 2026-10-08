import { useEffectEvent, useLayoutEffect, useRef, type RefObject } from 'react'
import { useAppStore } from '@/store'
import { isBrowserClientPageViewerTargetCurrent } from '@/runtime/browser-client-page-viewer-target'
import {
  BROWSER_CLIENT_HISTORY_EVENT,
  type BrowserClientHistoryEvent
} from '@/runtime/browser-client-history-request'
import { redactKagiSessionToken } from '../../../../../shared/browser-url'
import type { RuntimeBrowserClientPlacement } from '../../../../../shared/runtime-browser-placement'
import { readBrowserClientPageGuestMetadataIfLive } from '../browser-client-page-guest-metadata'
type Owner = {
  page: string
  worktreeId: string
  environmentId: string
  placement: RuntimeBrowserClientPlacement | null
  isActive: boolean
  unavailable: boolean
  webviewRef: RefObject<Electron.WebviewTag | null>
}
export function useClientHostedHistoryCommands(params: Owner): void {
  const latest = useRef(params)
  const epoch = useRef(0)
  const busy = useRef(false)
  const offeredTarget = useRef<BrowserClientHistoryEvent['command']['target'] | null>(null)
  useLayoutEffect(() => {
    latest.current = params
  })
  const onCommand = useEffectEvent((request: BrowserClientHistoryEvent) => {
    const { target, action } = request.command
    const matches = (): boolean => {
      const owner = latest.current
      return (
        owner.isActive &&
        !owner.unavailable &&
        owner.page === target.page &&
        owner.worktreeId === target.worktreeId &&
        owner.environmentId === target.environmentId &&
        isBrowserClientPageViewerTargetCurrent(target, owner.placement)
      )
    }
    if (!matches()) {
      return
    }
    offeredTarget.current = target
    const offeredEpoch = epoch.current
    request.offer(() => {
      const current = (): boolean => offeredEpoch === epoch.current && matches()
      if (!current() || Date.now() >= request.expiresAt || busy.current) {
        request.finish(new Error('browser_client_history_owner_unavailable'))
        return
      }
      const guest = latest.current.webviewRef.current
      busy.current = true
      try {
        const before = guest && readBrowserClientPageGuestMetadataIfLive(guest)
        if (!guest || !before) {
          throw new Error('browser_client_history_guest_unavailable')
        }
        if (!(action === 'back' ? guest.canGoBack() : guest.canGoForward())) {
          throw new Error('browser_client_history_unavailable')
        }
        if (
          !current() ||
          latest.current.webviewRef.current !== guest ||
          Date.now() >= request.expiresAt
        ) {
          throw new Error('browser_client_history_owner_unavailable')
        }
        if (action === 'back') {
          guest.goBack()
        } else {
          guest.goForward()
        }
        const after = readBrowserClientPageGuestMetadataIfLive(guest)
        if (!current() || latest.current.webviewRef.current !== guest || !after) {
          throw new Error('browser_client_history_owner_changed_effect_unknown')
        }
        request.finish(undefined, {
          target,
          action,
          accepted: true,
          completionObserved: false,
          observedUrl: redactKagiSessionToken(after.url),
          loading: after.loading
        })
      } catch (error) {
        request.finish(
          error instanceof Error ? error : new Error('browser_client_history_effect_unknown')
        )
      } finally {
        busy.current = false
      }
    })
  })
  useLayoutEffect(() => {
    const unsubscribe = useAppStore.subscribe(() => {
      const target = offeredTarget.current
      if (target && !isBrowserClientPageViewerTargetCurrent(target, latest.current.placement)) {
        epoch.current += 1
      }
    })
    const receive = (event: WindowEventMap['orca:browser-client-history-command']): void =>
      onCommand(event.detail)
    window.addEventListener(BROWSER_CLIENT_HISTORY_EVENT, receive)
    return () => {
      epoch.current += 1
      offeredTarget.current = null
      unsubscribe()
      window.removeEventListener(BROWSER_CLIENT_HISTORY_EVENT, receive)
    }
  }, [
    params.page,
    params.worktreeId,
    params.environmentId,
    params.placement,
    params.isActive,
    params.unavailable
  ])
}
