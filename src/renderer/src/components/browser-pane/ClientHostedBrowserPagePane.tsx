import { useClientHostedReloadCommands } from './navigate/use-client-hosted-reload-commands'
import { useClientHostedAddressOwner } from './navigate/use-client-hosted-address-owner'
import { useClientHostedPageAttachment } from './navigate/use-client-hosted-page-attachment'
import {
  useClientHostedNavigationCommands,
  type BrowserClientNavigationPublication
} from './navigate/use-client-hosted-navigation-commands'
import {
  createBrowserFailureOwner as createFailureOwner,
  openBrowserFailureExternalUrl
} from './navigate/use-browser-failure-commands'
import { useLayoutEffect, useRef, useState } from 'react'
import { BrowserPageZoomIndicator } from './assemble-chrome/browser-page-zoom-indicator'
import { useAppStore } from '@/store'
import type {
  BrowserLoadError,
  BrowserPage as BrowserPageState
} from '../../../../shared/browser-workspace-types'
import { toHttpsRecoveryUrl } from '../../../../shared/browser-url'
import type { RuntimeBrowserClientPlacement } from '../../../../shared/runtime-browser-placement'
import { useBrowserClientHostedDownloadNotices } from './browser-client-hosted-download-notices'
import { useBrowserClientHostedPopupNotices } from './browser-client-hosted-popup-notices'
import { useBrowserClientHostedPermissionNotices } from './browser-client-hosted-permission-notices'
import { useClientHostedBrowserIntroTour } from './use-client-hosted-browser-intro-tour'
import { ClientHostedBrowserUnavailableNotice } from './client-hosted-browser-unavailable-notice'
import { useRestoredClientHostedRecoveryWindow } from './restored-client-hosted-recovery-window'
import { useClientHostedBrowserMarkup } from './annotate/use-client-hosted-browser-markup'
import BrowserFind from './assemble-chrome/BrowserFind'
import { BrowserNavigationControlRow } from './assemble-chrome/browser-navigation-control-row'
import BrowserAddressBar from './assemble-chrome/BrowserAddressBar'
import { BrowserPageContextMenu } from './assemble-chrome/browser-page-context-menu'
import { useBrowserPageChromeFocus } from './assemble-chrome/use-browser-page-chrome-focus'
import { useBrowserAddressBarEditSession } from './assemble-chrome/use-browser-address-bar-edit-session'
import { useBrowserPageFindShortcuts } from './assemble-chrome/use-browser-page-find-shortcuts'
import { useWebviewGuestFocus } from './assemble-chrome/browser-page-guest-focus'
import { RemoteRuntimeEgressIndicator } from './assemble-chrome/browser-egress-indicator'
import { getBrowserPageZoomIndicatorState } from './host-guest/browser-page-zoom'
import { useBrowserPageWebviewShortcuts } from './host-guest/use-browser-page-webview-shortcuts'
import { useClientHostedGuestActivationFocus } from './host-guest/use-client-hosted-guest-activation-focus'
import { useBrowserPageZoomFeedback } from './host-guest/use-browser-page-zoom-feedback'
import { BrowserLoadFailureOverlay } from './navigate/browser-load-failure-overlay'
import { useClientHostedPageUrlSubmission } from './navigate/use-client-hosted-page-url-submission'
import { convertBrowserPageToWorkspaceDoc } from '@/lib/file-preview'
import { useBrowserPageReloadActions } from './navigate/use-browser-page-reload-actions'
import { getOpenableExternalUrl, toDisplayUrl } from './describe-page/browser-page-url-display'
import type {
  BrowserChromeShortcutScope,
  BrowserPageUrlSetter,
  BrowserTabPageState
} from './describe-page/browser-page-types'

export function ClientHostedBrowserPagePane({
  browserTab,
  workspaceId,
  runtimeEnvironmentId,
  worktreeId,
  placement,
  isActive,
  chromeShortcutScope,
  onUpdatePageState,
  onSetUrl
}: {
  browserTab: BrowserPageState
  workspaceId: string
  runtimeEnvironmentId: string
  worktreeId: string
  /** Null while the tab is still an optimistic stage: the host mints the placement, not this client. */
  placement: RuntimeBrowserClientPlacement | null
  isActive: boolean
  chromeShortcutScope: BrowserChromeShortcutScope
  onUpdatePageState: (tabId: string, updates: BrowserTabPageState) => void
  onSetUrl: BrowserPageUrlSetter
}): React.JSX.Element {
  const navigationVersionRef = useRef(0)
  const publishCurrentRef = useRef<(() => Promise<BrowserClientNavigationPublication>) | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const addressBarInputRef = useRef<HTMLInputElement | null>(null)
  // Why: a worktree switch unmounts this pane while main keeps the guest, so the failure has to
  // be seeded from the stored page — a fresh null here reads as "no failure" and the next sync
  // writes that back, which also deletes the page's certificate record.
  const activeLoadFailureRef = useRef<BrowserLoadError | null>(browserTab.loadError ?? null)
  const onUpdatePageStateRef = useRef(onUpdatePageState)
  const isActiveRef = useRef(isActive)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const addBrowserHistoryEntry = useAppStore((s) => s.addBrowserHistoryEntry)
  const challenge = useAppStore((s) => s.browserCertificateFailuresByPageId[browserTab.id] ?? null)
  const browserHostClientId = placement?.browserHostClientId ?? null
  const browserHostGeneration = placement?.browserHostGeneration ?? null
  const pageHostGeneration = placement?.pageHostGeneration ?? null
  const restoredPageUnrecovered = useRestoredClientHostedRecoveryWindow({
    browserPageId: browserTab.id,
    environmentId: runtimeEnvironmentId,
    placementPending: placement === null
  })
  // Why: a client-hosted guest is created by main's host runtime, so there is no local guest to
  // recreate — a lost one is page unavailability, whose panel offers the reopen-on-server escape.
  const retryGuestRecoveryRef = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    onUpdatePageStateRef.current = onUpdatePageState
    isActiveRef.current = isActive
    retryGuestRecoveryRef.current = () => {
      onUpdatePageState(browserTab.id, { loading: false })
      setAttachmentError('browser_client_page_guest_unavailable')
    }
  }, [browserTab.id, isActive, onUpdatePageState])

  const guestFocus = useWebviewGuestFocus(webviewRef)
  const shortcutOwner = { browserTabId: browserTab.id, workspaceId, isActive, chromeShortcutScope }
  const { keepAddressBarFocusRef, startAddressBarFocusGrab } = useBrowserPageChromeFocus({
    ...shortcutOwner,
    addressBarInputRef,
    guestFocus
  })
  // Why the order matters: this resumes an interrupted edit in a layout effect, and the attach
  // effect below syncs the bar to the guest's URL through the setter it hands back. Called after
  // the attach effect, the resume would land on a bar that has already been overwritten.
  const { addressBarValue, setAddressBarValue, setAddressBarValueFromPage, addressBarEditSession } =
    useBrowserAddressBarEditSession({
      pageId: browserTab.id,
      url: browserTab.url,
      addressBarInputRef,
      startAddressBarFocusGrab
    })
  const zoom = useBrowserPageZoomFeedback(browserTab.id)
  const addressCommandOwner = useClientHostedAddressOwner({
    page: browserTab.id,
    worktreeId,
    environmentId: runtimeEnvironmentId,
    active: isActive && !attachmentError && !restoredPageUnrecovered,
    placement
  })

  const reload = useBrowserPageReloadActions({
    browserTab,
    webviewRef,
    retryGuestRecoveryRef,
    onUpdatePageStateRef
  })

  useClientHostedReloadCommands(addressCommandOwner, () =>
    reload.reloadWebviewOrRecoverGuest(false)
  )

  useBrowserClientHostedDownloadNotices(browserTab.id)
  useBrowserClientHostedPopupNotices(browserTab.id)
  useBrowserClientHostedPermissionNotices(browserTab.id)
  // Why: the tour points at controls that cannot work yet, and recording the interaction is a
  // one-way write that would burn the tour on a pane the user has not really seen.
  useClientHostedBrowserIntroTour(isActive && !attachmentError && placement !== null)
  useBrowserPageFindShortcuts({
    ...shortcutOwner,
    setFindOpen
  })
  useBrowserPageWebviewShortcuts({
    ...shortcutOwner,
    isActiveRef,
    webviewRef,
    paneZoomLevelRef: zoom.paneZoomLevelRef,
    setBrowserDefaultZoomLevel: zoom.setBrowserDefaultZoomLevel,
    showBrowserZoomFeedback: zoom.showBrowserZoomFeedback,
    reloadWebviewOrRecoverGuest: reload.reloadWebviewOrRecoverGuest
  })

  const navigateToUrl = useClientHostedPageUrlSubmission({
    browserTabId: browserTab.id,
    worktreeId,
    webviewRef,
    activeLoadFailureRef,
    onUpdatePageState,
    setAddressBarValue
  })
  useClientHostedNavigationCommands({
    page: browserTab.id,
    worktreeId,
    environmentId: runtimeEnvironmentId,
    placement,
    isActive,
    unavailable: Boolean(attachmentError) || restoredPageUnrecovered,
    webviewRef,
    publishCurrentRef,
    navigationVersionRef,
    navigate: navigateToUrl
  })

  useClientHostedPageAttachment({
    browserPageId: browserTab.id,
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
  })

  useClientHostedGuestActivationFocus({ isActive, guestFocus, keepAddressBarFocusRef })

  const showFailureOverlay = !attachmentError && Boolean(browserTab.loadError)
  // Why: the failure is about the URL that failed, not whatever page is still loaded — feeding
  // browserTab.url here named the previous page and offered it an HTTPS retry it never needed.
  const failedNavigationUrl = browserTab.loadError?.validatedUrl ?? toDisplayUrl(browserTab.url)
  const browserZoomIndicatorState = getBrowserPageZoomIndicatorState({
    feedbackVisible: zoom.browserZoomFeedbackVisible,
    isDefaultZoom: zoom.browserZoomPercent === zoom.browserDefaultZoomPercent
  })

  const markup = useClientHostedBrowserMarkup({
    webviewRef,
    browserPageId: browserTab.id,
    runtimeEnvironmentId,
    placement,
    isActive,
    unavailable: Boolean(attachmentError) || restoredPageUnrecovered,
    showFailureOverlay
  })

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col bg-background">
      {/* IPC-driven context menu in a Portal so position:fixed escapes ancestor transform/backdrop-filter containing blocks. */}
      <BrowserPageContextMenu
        isActive={isActive}
        browserPageId={browserTab.id}
        worktreeId={worktreeId}
        canGoBack={browserTab.canGoBack}
        canGoForward={browserTab.canGoForward}
        webviewRef={webviewRef}
        onReload={() => reload.reloadWebviewOrRecoverGuest(false)}
      />
      <div data-contextual-tour-target="client-hosted-browser-controls">
        <BrowserNavigationControlRow
          controls={{
            canGoBack: browserTab.canGoBack,
            canGoForward: browserTab.canGoForward,
            // Why the unrecovered case reads not-loading: nothing is coming, and a spinner nobody
            // will ever stop is the one state this pane must not sit in.
            loading: !restoredPageUnrecovered && (placement === null || browserTab.loading),
            goBack: () => webviewRef.current?.goBack(),
            goForward: () => webviewRef.current?.goForward(),
            reload: () => reload.runReloadTrigger('button'),
            navigate: navigateToUrl
          }}
          addressSlot={
            <BrowserAddressBar
              commandOwner={addressCommandOwner}
              value={addressBarValue}
              onChange={setAddressBarValue}
              onSubmit={() => navigateToUrl(addressBarValue)}
              onNavigate={navigateToUrl}
              onOpenWorkspaceDoc={(doc) => convertBrowserPageToWorkspaceDoc(browserTab.id, doc)}
              inputRef={addressBarInputRef}
              editSession={addressBarEditSession}
              leadingIcon={
                <RemoteRuntimeEgressIndicator
                  runtimeEnvironmentId={runtimeEnvironmentId}
                  presentation="client-hosted"
                  commandOwner={{ page: browserTab.id, isActive, clientPlacement: placement }}
                />
              }
            />
          }
          reloadLabel={reload.reloadButtonLabel}
        >
          {markup.drawButton}
        </BrowserNavigationControlRow>
      </div>
      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden bg-background">
        {markup.overlay}
        <BrowserPageZoomIndicator
          state={browserZoomIndicatorState}
          percent={zoom.browserZoomPercent}
        />
        <BrowserFind
          commandOwner={addressCommandOwner}
          browserPageId={browserTab.id}
          onOpen={() => setFindOpen(true)}
          isOpen={findOpen}
          onClose={() => setFindOpen(false)}
          webviewRef={webviewRef}
          guestGeneration={pageHostGeneration}
        />
        {showFailureOverlay && browserTab.loadError ? (
          <BrowserLoadFailureOverlay
            commandOwner={createFailureOwner(browserTab, runtimeEnvironmentId, isActive, placement)}
            loadError={browserTab.loadError}
            currentUrl={toDisplayUrl(failedNavigationUrl)}
            httpsRecoveryUrl={toHttpsRecoveryUrl(failedNavigationUrl)}
            onRetry={() => reload.runReloadTrigger('reload')}
            onTryHttps={navigateToUrl}
            onCopy={(url) => window.api.ui.writeClipboardText(url)}
            onOpenExternal={openBrowserFailureExternalUrl}
            externalUrl={getOpenableExternalUrl(failedNavigationUrl)}
            certificateFailure={challenge}
            expectedBrowserPageId={browserTab.id}
            // Why: the guest is a local Electron webview on this desktop, so its certificate
            // decision is a local session decision — the same IPC the local pane proceeds through.
            onProceedCertificate={(challengeId) =>
              window.api.browser.proceedCertificate({
                browserPageId: browserTab.id,
                challengeId
              })
            }
          />
        ) : null}
        {attachmentError || restoredPageUnrecovered ? (
          <ClientHostedBrowserUnavailableNotice
            commandOwner={
              placement
                ? { page: browserTab.id, active: isActive, clientPlacement: placement }
                : undefined
            }
            runtimeEnvironmentId={runtimeEnvironmentId}
            worktreeId={worktreeId}
            lastCommittedUrl={browserTab.url}
          />
        ) : null}
      </div>
    </div>
  )
}
