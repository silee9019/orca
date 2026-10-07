import type { ComponentProps } from 'react'
import { vi } from 'vitest'
import type { BrowserGuestAnnotateOverlays } from './browser-guest-annotate-overlays'
export function makeBrowserGuestOverlayFixture(
  container: HTMLDivElement
): Omit<ComponentProps<typeof BrowserGuestAnnotateOverlays>, 'markup'> {
  return {
    grab: {
      state: 'idle',
      payload: null,
      error: null,
      contextMenu: false,
      toggle: vi.fn(),
      cancel: vi.fn(),
      rearm: vi.fn(),
      exit: vi.fn()
    },
    annotationSend: {
      browserAnnotations: [],
      browserAnnotationsPrompt: '',
      browserAnnotationTrayOpen: false,
      setBrowserAnnotationTrayOpen: vi.fn(),
      browserAnnotationsCopied: false,
      annotationBannerSendOpen: false,
      annotationTraySendOpen: false,
      handleAnnotationBannerSendOpenChange: vi.fn(),
      handleAnnotationTraySendOpenChange: vi.fn(),
      handleCopyBrowserAnnotations: vi.fn(),
      copyBrowserAnnotationsVerified: vi.fn(async () => false),
      handleClearBrowserAnnotations: vi.fn(),
      handleDeleteBrowserAnnotation: vi.fn(),
      handleUpdateBrowserAnnotation: vi.fn(),
      handleBrowserAnnotationsSentToAgent: vi.fn(),
      handleBrowserAnnotationsHandedOff: vi.fn(),
      activeGroupId: undefined
    },
    grabAnnotations: {
      grabIntent: 'copy',
      startGrabIntent: vi.fn(),
      pendingAnnotationPayload: null,
      setPendingAnnotationPayload: vi.fn(),
      grabToast: null,
      setGrabToast: vi.fn(),
      grabToastTimerRef: { current: undefined },
      dismissGrabToast: vi.fn(),
      handleGrabCopy: vi.fn(),
      handleGrabCopyScreenshot: vi.fn(),
      grabMenuActionTakenRef: { current: false },
      handleAddBrowserAnnotation: vi.fn(),
      handleCancelPendingBrowserAnnotation: vi.fn(),
      cancelPendingBrowserCapture: vi.fn(),
      handleGrabActionShortcut: vi.fn()
    },
    containerRef: { current: container },
    markupPortalContainer: container,
    webviewRef: { current: null },
    browserOverlayViewport: { scrollX: 0, scrollY: 0, version: 0 },
    worktreeId: 'workspace-fixture'
  }
}
