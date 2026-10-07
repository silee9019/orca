import type { ComponentProps, Dispatch, SetStateAction } from 'react'
import { BrowserPageViewportOverlays } from '../assemble-chrome/browser-page-viewport-overlays'
import { ClientHostedBrowserPagePane } from '../ClientHostedBrowserPagePane'
import { useAppStore } from '@/store'
import { TooltipProvider } from '@/components/ui/tooltip'
export function BrowserFailureFixtureOwner({
  placement,
  notice,
  localViewportOverrides
}: {
  placement: 'local' | 'client-hosted'
  notice: Dispatch<SetStateAction<string | null>>
  localViewportOverrides?: Partial<ComponentProps<typeof BrowserPageViewportOverlays>>
}) {
  const page = useAppStore((state) =>
    Object.values(state.browserPagesByWorkspace)
      .flat()
      .find((page) => page.id === 'page')
  )
  if (!page) {
    throw new Error('Missing fixture page')
  }
  if (placement === 'client-hosted') {
    return (
      <TooltipProvider>
        <ClientHostedBrowserPagePane
          browserTab={page}
          workspaceId={page.workspaceId}
          runtimeEnvironmentId="environment"
          worktreeId={page.worktreeId}
          placement={{
            kind: 'client',
            browserHostClientId: 'fixture',
            browserHostGeneration: 1,
            pageHostGeneration: 1
          }}
          isActive
          chromeShortcutScope="focused"
          onUpdatePageState={useAppStore.getState().updateBrowserPageState}
          onSetUrl={useAppStore.getState().setBrowserPageUrl}
        />
      </TooltipProvider>
    )
  }
  const props: ComponentProps<typeof BrowserPageViewportOverlays> = {
    browserTab: page,
    worktreeId: page.worktreeId,
    showFailureOverlay: true,
    failureExternalUrl: page.loadError?.validatedUrl ?? null,
    failedNavigationUrl: page.loadError?.validatedUrl ?? page.url,
    onUpdatePageStateRef: { current: useAppStore.getState().updateBrowserPageState },
    retryGuestRecoveryRef: { current: () => {} },
    navigateToUrl: () => {},
    setResourceNotice: notice,
    certificateFailure: useAppStore.getState().browserCertificateFailuresByPageId[page.id] ?? null,
    sshRouted: false,
    isBlankTab: false,
    containerRef: { current: null },
    markupPortalContainer: null,
    browserOverlayViewport: { scrollX: 0, scrollY: 0, version: 0 },
    browserZoomIndicatorState: { ariaHidden: true, opacityClassName: 'opacity-0' },
    browserZoomPercent: 100,
    findOpen: false,
    setFindOpen: () => {},
    webviewRef: { current: null },
    markup: {
      state: 'idle',
      isActive: false,
      baseImage: null,
      start: async () => {},
      cancel: () => {},
      complete: async () => {}
    },
    grab: {
      state: 'idle',
      payload: null,
      error: null,
      contextMenu: false,
      toggle: () => {},
      cancel: () => {},
      rearm: () => {},
      exit: () => {}
    },
    annotationSend: {
      browserAnnotations: [],
      browserAnnotationsPrompt: '',
      browserAnnotationTrayOpen: false,
      setBrowserAnnotationTrayOpen: () => {},
      browserAnnotationsCopied: false,
      annotationBannerSendOpen: false,
      annotationTraySendOpen: false,
      handleAnnotationBannerSendOpenChange: () => {},
      handleAnnotationTraySendOpenChange: () => {},
      handleCopyBrowserAnnotations: () => {},
      copyBrowserAnnotationsVerified: async () => false,
      handleClearBrowserAnnotations: () => {},
      handleDeleteBrowserAnnotation: () => {},
      handleUpdateBrowserAnnotation: () => {},
      handleBrowserAnnotationsSentToAgent: () => {},
      handleBrowserAnnotationsHandedOff: () => {},
      activeGroupId: undefined
    },
    grabAnnotations: {
      grabIntent: 'copy',
      startGrabIntent: () => {},
      pendingAnnotationPayload: null,
      setPendingAnnotationPayload: () => {},
      grabToast: null,
      setGrabToast: () => {},
      grabToastTimerRef: { current: undefined },
      dismissGrabToast: () => {},
      handleGrabCopy: () => {},
      handleGrabCopyScreenshot: () => {},
      grabMenuActionTakenRef: { current: false },
      handleAddBrowserAnnotation: () => undefined,
      handleCancelPendingBrowserAnnotation: () => {},
      cancelPendingBrowserCapture: () => {},
      handleGrabActionShortcut: () => {}
    }
  }
  return (
    <TooltipProvider>
      <BrowserPageViewportOverlays {...props} {...localViewportOverrides} />
    </TooltipProvider>
  )
}
