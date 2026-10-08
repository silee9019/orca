import { TooltipProvider } from '@/components/ui/tooltip'
import { useRef } from 'react'
import { useAppStore } from '@/store'
import { makeAnnotation } from '@/store/slices/browser-annotation-test-fixture'
import { useGrabMode } from '../annotate/useGrabMode'
import { useBrowserPageAnnotationSend } from '../annotate/use-browser-page-annotation-send'
import { useBrowserPageGrabAnnotations } from '../annotate/use-browser-page-grab-annotations'
import { useBrowserPageResourceNotices } from '../navigate/use-browser-page-resource-notices'
import { BrowserPageChromeBanners } from './browser-page-chrome-banners'
export function BrowserBannerFixture({
  page = 'page',
  active = true
}: {
  page?: string
  active?: boolean
}) {
  const resource = useBrowserPageResourceNotices(page)
  const grab = useGrabMode(page)
  const send = useBrowserPageAnnotationSend({ browserTabId: page, worktreeId: 'folder:fixture' })
  const annotations = useBrowserPageGrabAnnotations({
    browserTabId: page,
    isActive: active,
    grab,
    containerRef: useRef(null),
    webviewRef: useRef(null),
    setBrowserOverlayViewport: () => {},
    browserAnnotationsLength: send.browserAnnotations.length,
    setBrowserAnnotationTrayOpen: send.setBrowserAnnotationTrayOpen
  })
  return (
    <TooltipProvider>
      <button onClick={() => resource.setResourceNotice('FIXTURE_PRIVATE')}>Seed notice</button>
      <button onClick={() => resource.setResourceNotice('FIXTURE_REPLACEMENT')}>
        Replace notice
      </button>
      <button onClick={() => annotations.startGrabIntent('annotate')}>Start annotation grab</button>
      <button onClick={() => useAppStore.getState().addBrowserPageAnnotation(makeAnnotation(page))}>
        Seed annotation
      </button>
      <BrowserPageChromeBanners
        commandOwner={{ page, isActive: active }}
        {...resource}
        grab={grab}
        grabIntent={annotations.grabIntent}
        pendingAnnotationPayload={annotations.pendingAnnotationPayload}
        browserAnnotationsLength={send.browserAnnotations.length}
        annotationBannerSendOpen={send.annotationBannerSendOpen}
        handleAnnotationBannerSendOpenChange={send.handleAnnotationBannerSendOpenChange}
        worktreeId="folder:fixture"
        activeGroupId={send.activeGroupId}
        browserAnnotationsPrompt={send.browserAnnotationsPrompt}
        handleBrowserAnnotationsSentToAgent={send.handleBrowserAnnotationsSentToAgent}
        handleBrowserAnnotationsHandedOff={send.handleBrowserAnnotationsHandedOff}
        handleCopyBrowserAnnotations={send.handleCopyBrowserAnnotations}
        browserAnnotationsCopied={send.browserAnnotationsCopied}
        handleClearBrowserAnnotations={send.handleClearBrowserAnnotations}
        setPendingAnnotationPayload={annotations.setPendingAnnotationPayload}
      />
    </TooltipProvider>
  )
}
