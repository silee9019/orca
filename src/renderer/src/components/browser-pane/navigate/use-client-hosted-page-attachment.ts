import { useEffectEvent, useLayoutEffect, type RefObject } from 'react'
import type { BrowserLoadError } from '../../../../../shared/browser-workspace-types'
import type { BrowserPageUrlSetter, BrowserTabPageState } from '../describe-page/browser-page-types'
import type { BrowserClientNavigationPublication } from './use-client-hosted-navigation-commands'
import type { BrowserClientPageMetadataAcknowledgment } from '../browser-client-page-metadata-publisher'
import {
  readBrowserClientPageGuestMetadataIfLive,
  createBrowserClientPageLoadFailureHandler
} from '../browser-client-page-guest-metadata'
import {
  forgetBrowserClientPageMetadataReports,
  startBrowserClientPageMetadataPublisher
} from '../browser-client-page-metadata-reporting'
import { attachBrowserClientPageToViewport } from '../browser-client-page-renderer-installation'
import { watchBrowserClientPageGuestLoss } from '../host-guest/browser-client-page-guest-loss'
import { resolveActiveBrowserLoadFailure } from './browser-load-failure-for-url'
import { consumeBrowserPageDeferredNavigation } from './browser-page-deferred-navigation'
import { getBrowserDisplayTitle, toDisplayUrl } from '../describe-page/browser-page-url-display'
export function useClientHostedPageAttachment(params: {
  browserPageId: string
  runtimeEnvironmentId: string
  viewportRef: RefObject<HTMLDivElement | null>
  webviewRef: RefObject<Electron.WebviewTag | null>
  pageHostGeneration: number | null
  browserHostClientId: string | null
  browserHostGeneration: number | null
  setAttachmentError: (value: string | null) => void
  retryGuestRecoveryRef: RefObject<() => void>
  navigationVersionRef: RefObject<number>
  publishCurrentRef: RefObject<(() => Promise<BrowserClientNavigationPublication>) | null>
  activeLoadFailureRef: RefObject<BrowserLoadError | null>
  onSetUrl: BrowserPageUrlSetter
  onUpdatePageState: (id: string, updates: BrowserTabPageState) => void
  addBrowserHistoryEntry: (url: string, title: string) => void
  setAddressBarValueFromPage: (value: string) => void
  navigateToUrl: (value: string) => void
}): void {
  const {
    browserPageId,
    runtimeEnvironmentId,
    viewportRef,
    webviewRef,
    pageHostGeneration,
    browserHostClientId,
    browserHostGeneration,
    setAttachmentError,
    retryGuestRecoveryRef,
    publishCurrentRef,
    navigationVersionRef,
    activeLoadFailureRef,
    onSetUrl,
    onUpdatePageState,
    addBrowserHistoryEntry,
    setAddressBarValueFromPage,
    navigateToUrl
  } = params
  const setUrlFromGuest = useEffectEvent(onSetUrl)
  const updatePageStateFromGuest = useEffectEvent(onUpdatePageState)
  const recordHistoryFromGuest = useEffectEvent(addBrowserHistoryEntry)
  const runDeferredNavigation = useEffectEvent(navigateToUrl)
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    // Wait for host adoption before attaching an optimistic page the registry has not seen.
    if (
      !viewport ||
      pageHostGeneration === null ||
      browserHostClientId === null ||
      browserHostGeneration === null
    ) {
      return
    }
    let attachment: ReturnType<typeof attachBrowserClientPageToViewport>
    try {
      attachment = attachBrowserClientPageToViewport(
        { browserPageId: browserPageId, pageHostGeneration },
        viewport
      )
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : 'browser_client_page_unavailable')
      return
    }
    if (!attachment) {
      setAttachmentError('browser_client_page_renderer_unavailable')
      return
    }
    const webview = attachment.webview
    // Guest loss uses the existing recovery notice and clears pending loading state.
    let releaseGuest = (): void => attachment.detach()
    const guestLoss = watchBrowserClientPageGuestLoss({
      webview,
      webviewRef,
      browserPageId: browserPageId,
      pageHostGeneration,
      onLost: () => {
        releaseGuest()
        retryGuestRecoveryRef.current()
      }
    })
    // Main can destroy the guest while its tag still holds the stale id.
    const attachedMetadata = readBrowserClientPageGuestMetadataIfLive(webview)
    if (!attachedMetadata) {
      guestLoss.lose('unreadable')
      return guestLoss.dispose()
    }
    const publisher = startBrowserClientPageMetadataPublisher({
      browserPageId: browserPageId,
      environmentId: runtimeEnvironmentId,
      placement: {
        kind: 'client',
        browserHostClientId,
        browserHostGeneration,
        pageHostGeneration
      },
      nextRevision: attachment.nextMetadataRevision
    })
    webviewRef.current = webview
    setAttachmentError(null)
    // Reconcile restored failures once; failed navigations this session may never commit a URL.
    activeLoadFailureRef.current = resolveActiveBrowserLoadFailure(
      activeLoadFailureRef.current,
      attachedMetadata.url
    )
    const syncNavigation = (
      event?: Event,
      acknowledge?: BrowserClientPageMetadataAcknowledgment
    ): void => {
      if (event?.type === 'did-navigate' || event?.type === 'did-navigate-in-page') {
        navigationVersionRef.current += 1
      }
      const eventUrl = (event as (Event & { url?: string }) | undefined)?.url
      const metadata = readBrowserClientPageGuestMetadataIfLive(webview, eventUrl)
      if (!metadata) {
        acknowledge?.(null)
        guestLoss.lose('unreadable')
        return
      }
      // did-stop-loading must preserve the preceding did-fail-load overlay.
      const activeLoadFailure = activeLoadFailureRef.current
      // URL writes clear certificate challenges, so preserve them while a failure stands.
      if (!activeLoadFailure) {
        setUrlFromGuest(browserPageId, metadata.url, {
          preserveLoadError: true
        })
      }
      updatePageStateFromGuest(browserPageId, {
        title: metadata.title,
        loading: metadata.loading,
        canGoBack: metadata.canGoBack,
        canGoForward: metadata.canGoForward,
        loadError: activeLoadFailure
      })
      publisher.publish(metadata, acknowledge)
      // Address-bar suggestions use the client's URL history, including client-hosted pages.
      recordHistoryFromGuest(metadata.url, getBrowserDisplayTitle(metadata.title, metadata.url))
      setAddressBarValueFromPage(toDisplayUrl(metadata.url))
    }
    publishCurrentRef.current = () =>
      new Promise((resolve, reject) => {
        const metadata = readBrowserClientPageGuestMetadataIfLive(webview)
        if (!metadata || metadata.loading || activeLoadFailureRef.current) {
          reject(new Error('browser_client_navigation_effect_unknown'))
          return
        }
        syncNavigation(undefined, (metadataRevision) => {
          if (metadataRevision === null) {
            reject(new Error('browser_client_navigation_metadata_unverified'))
          } else {
            resolve({ url: metadata.url, metadataRevision })
          }
        })
      })
    const onStart = (): void => {
      activeLoadFailureRef.current = null
      updatePageStateFromGuest(browserPageId, { loading: true, loadError: null })
      const startMetadata = readBrowserClientPageGuestMetadataIfLive(webview, undefined, true)
      if (!startMetadata) {
        guestLoss.lose('unreadable')
        return
      }
      publisher.publish(startMetadata)
    }
    const onFailLoad = createBrowserClientPageLoadFailureHandler(
      webview,
      () => guestLoss.lose('unreadable'),
      (loadError) => {
        activeLoadFailureRef.current = loadError
        updatePageStateFromGuest(browserPageId, { loading: false, loadError })
      }
    )
    const cleanupGuest = (): void => {
      publishCurrentRef.current = null
      webview.removeEventListener('did-start-loading', onStart)
      webview.removeEventListener('did-stop-loading', syncNavigation)
      webview.removeEventListener('did-navigate', syncNavigation)
      webview.removeEventListener('did-navigate-in-page', syncNavigation)
      webview.removeEventListener('page-title-updated', syncNavigation)
      webview.removeEventListener('did-fail-load', onFailLoad)
      guestLoss.dispose()
      publisher.dispose()
      forgetBrowserClientPageMetadataReports(browserPageId)
      attachment.detach()
    }
    releaseGuest = cleanupGuest
    webview.addEventListener('did-start-loading', onStart)
    webview.addEventListener('did-stop-loading', syncNavigation)
    webview.addEventListener('did-navigate', syncNavigation)
    webview.addEventListener('did-navigate-in-page', syncNavigation)
    webview.addEventListener('page-title-updated', syncNavigation)
    webview.addEventListener('did-fail-load', onFailLoad)
    syncNavigation()
    // Resume navigation submitted before host adoption.
    const deferredUrl = consumeBrowserPageDeferredNavigation(browserPageId)
    if (deferredUrl) {
      runDeferredNavigation(deferredUrl)
    }
    return cleanupGuest
  }, [
    browserPageId,
    browserHostClientId,
    browserHostGeneration,
    pageHostGeneration,
    runtimeEnvironmentId,
    setAddressBarValueFromPage,
    activeLoadFailureRef,
    viewportRef,
    webviewRef,
    retryGuestRecoveryRef,
    publishCurrentRef,
    navigationVersionRef,
    setAttachmentError
  ])
}
