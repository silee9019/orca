import { useClientHostedInputFeedbackCommands } from './use-client-hosted-input-feedback-commands'
import { useClientHostedHistoryCommands } from './use-client-hosted-history-commands'
import { useClientHostedDeferredCommands } from './use-client-hosted-deferred-commands'
import { useClientHostedDocumentCommands } from './use-client-hosted-document-commands'
import type { WorkspaceDocAddressOutcome } from './workspace-doc-address-submission'
import { useAppStore } from '@/store'
import { useEffectEvent, useLayoutEffect, useRef, type RefObject } from 'react'
import type { RuntimeBrowserClientPlacement } from '../../../../../shared/runtime-browser-placement'
import type { BrowserClientNavigationEvent } from '@/runtime/browser-client-navigation-request'
import { BROWSER_CLIENT_NAVIGATION_EVENT } from '@/runtime/browser-client-navigation-request'
import { isBrowserClientPageViewerTargetCurrent } from '@/runtime/browser-client-page-viewer-target'
import { readBrowserClientPageGuestMetadataIfLive } from '../browser-client-page-guest-metadata'
export type BrowserClientNavigationPublication = { url: string; metadataRevision: number }
export function useClientHostedNavigationCommands(params: {
  page: string
  worktreeId: string
  environmentId: string
  placement: RuntimeBrowserClientPlacement | null
  isActive: boolean
  unavailable: boolean
  webviewRef: RefObject<Electron.WebviewTag | null>
  navigationVersionRef: RefObject<number>
  publishCurrentRef: RefObject<(() => Promise<BrowserClientNavigationPublication>) | null>
  navigate: (
    url: string,
    onSubmitted?: (pending: Promise<void>) => void,
    onWorkspaceDocOutcome?: (outcome: WorkspaceDocAddressOutcome) => void,
    onDeferred?: (url: string) => void
  ) => void
}): void {
  useClientHostedInputFeedbackCommands(params)
  useClientHostedDocumentCommands(params)
  useClientHostedHistoryCommands(params)
  useClientHostedDeferredCommands(params)
  const pendingRef = useRef<BrowserClientNavigationEvent | null>(null)
  const offeredTarget = useRef<BrowserClientNavigationEvent['target'] | null>(null)
  const epoch = useRef(0)
  const onCommand = useEffectEvent((request: BrowserClientNavigationEvent) => {
    const { target } = request
    if (
      target.page !== params.page ||
      target.worktreeId !== params.worktreeId ||
      target.environmentId !== params.environmentId ||
      !isBrowserClientPageViewerTargetCurrent(target, params.placement)
    ) {
      return
    }
    offeredTarget.current = target
    const offeredEpoch = epoch.current
    request.offer(params.isActive, () => {
      if (offeredEpoch !== epoch.current) {
        request.finish(new Error('browser_client_navigation_owner_changed_effect_unknown'))
        return
      }
      if (pendingRef.current?.isSettled()) {
        pendingRef.current = null
      }
      if (pendingRef.current || params.unavailable || !params.publishCurrentRef.current) {
        request.finish(new Error('browser_client_navigation_unavailable'))
        return
      }
      const guest = params.webviewRef.current
      if (!guest || !readBrowserClientPageGuestMetadataIfLive(guest)) {
        request.finish(new Error('browser_client_navigation_guest_unavailable'))
        return
      }
      const navigationVersion = params.navigationVersionRef.current
      pendingRef.current = request
      const current = (): boolean =>
        !request.isSettled() &&
        request.expiresAt > Date.now() &&
        params.webviewRef.current === guest &&
        isBrowserClientPageViewerTargetCurrent(target, params.placement)
      let submitted = false
      try {
        params.navigate(request.url, (navigation) => {
          submitted = true
          void navigation
            .then(async () => {
              if (
                !current() ||
                !params.publishCurrentRef.current ||
                params.navigationVersionRef.current <= navigationVersion
              ) {
                throw new Error('browser_client_navigation_owner_changed_effect_unknown')
              }
              const publication = await params.publishCurrentRef.current()
              const metadata = readBrowserClientPageGuestMetadataIfLive(guest)
              if (!current() || !metadata || metadata.loading || metadata.url !== publication.url) {
                throw new Error('browser_client_navigation_effect_unknown')
              }
              request.finish(undefined, {
                ...target,
                ...publication,
                loading: false,
                accepted: true
              })
            })
            .catch((error: unknown) =>
              request.finish(
                error instanceof Error
                  ? error
                  : new Error('browser_client_navigation_effect_unknown')
              )
            )
            .finally(() => {
              if (pendingRef.current === request) {
                pendingRef.current = null
              }
            })
        })
        if (!submitted) {
          throw new Error('browser_client_navigation_not_submitted')
        }
      } catch (error) {
        pendingRef.current = null
        request.finish(
          error instanceof Error ? error : new Error('browser_client_navigation_effect_unknown')
        )
      }
    })
  })
  useLayoutEffect(() => {
    const unsubscribe = useAppStore.subscribe(() => {
      const target = offeredTarget.current
      if (target && !isBrowserClientPageViewerTargetCurrent(target, params.placement)) {
        epoch.current += 1
        pendingRef.current?.finish(
          new Error('browser_client_navigation_owner_changed_effect_unknown')
        )
        pendingRef.current = null
      }
    })
    const listener = (event: WindowEventMap['orca:browser-client-navigation-command']): void =>
      onCommand(event.detail)
    window.addEventListener(BROWSER_CLIENT_NAVIGATION_EVENT, listener)
    return () => {
      epoch.current += 1
      unsubscribe()
      offeredTarget.current = null
      window.removeEventListener(BROWSER_CLIENT_NAVIGATION_EVENT, listener)
      pendingRef.current?.finish(
        new Error('browser_client_navigation_owner_changed_effect_unknown')
      )
      pendingRef.current = null
    }
  }, [params.page, params.worktreeId, params.environmentId, params.placement, params.isActive])
}
