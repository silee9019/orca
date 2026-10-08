import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { syncGuestAnnotationViewportBridge } from '@/components/browser-pane/annotate/guest-annotation-viewport-bridge'
import { useBrowserPageAnnotationSend } from '@/components/browser-pane/annotate/use-browser-page-annotation-send'
import { useBrowserPageGrabAnnotations } from '@/components/browser-pane/annotate/use-browser-page-grab-annotations'
import { useBrowserPageMarkupCapture } from '@/components/browser-pane/annotate/use-browser-page-markup-capture'
import { useGrabMode } from '@/components/browser-pane/annotate/useGrabMode'
import type { BrowserOverlayViewport } from '@/components/browser-pane/describe-page/browser-annotation-geometry'
import type { BrowserChromeElementTools } from '@/components/browser-pane/assemble-chrome/browser-chrome-toolbar'

// Stored annotations keep the page ID; typed markup requests also retain the current grant and guest.
export function useDocPreviewGuestTools({
  previewId,
  worktreeId,
  grantId,
  webviewRef,
  containerRef,
  toolsReady,
  isActive = true
}: {
  previewId: string
  worktreeId: string
  grantId: string | null
  webviewRef: MutableRefObject<Electron.WebviewTag | null>
  containerRef: MutableRefObject<HTMLDivElement | null>
  toolsReady: boolean
  isActive?: boolean
}): {
  grab: ReturnType<typeof useGrabMode>
  markup: ReturnType<typeof useBrowserPageMarkupCapture>
  annotationSend: ReturnType<typeof useBrowserPageAnnotationSend>
  grabAnnotations: ReturnType<typeof useBrowserPageGrabAnnotations>
  browserOverlayViewport: BrowserOverlayViewport
  elementTools: BrowserChromeElementTools
} {
  // Why still empty before the first grant: the page is only a tool target once a document is on
  // screen, and useGrabMode needs a stable identity every render rather than one to guess with.
  const toolTargetId = grantId === null ? '' : previewId
  const annotationViewportBridgeTokenRef = useRef<string>(undefined!)
  annotationViewportBridgeTokenRef.current ??= createBrowserUuid().replaceAll('-', '')
  const [browserOverlayViewport, setBrowserOverlayViewport] = useState<BrowserOverlayViewport>({
    scrollX: 0,
    scrollY: 0,
    version: 0
  })

  const grabElementShortcut = useShortcutLabel('browser.grabElement')
  const grab = useGrabMode(toolTargetId)
  const guest = webviewRef.current
  const binding = useMemo(
    () => ({ grantId, guest, toolsReady, isActive }),
    [grantId, guest, toolsReady, isActive]
  )
  const current = useRef(binding)
  useLayoutEffect(() => {
    current.current = binding
  })
  const markup = useBrowserPageMarkupCapture(webviewRef, {
    page: toolTargetId,
    active: grantId !== null && toolsReady && isActive && grab.state === 'idle',
    isCurrent: () =>
      grantId !== null &&
      current.current === binding &&
      webviewRef.current === guest &&
      current.current.toolsReady &&
      current.current.isActive
  })
  const annotationSend = useBrowserPageAnnotationSend({ browserTabId: previewId, worktreeId })
  const grabAnnotations = useBrowserPageGrabAnnotations({
    browserTabId: previewId,
    toolTargetId,
    isActive: toolsReady,
    grab,
    containerRef,
    webviewRef,
    setBrowserOverlayViewport,
    browserAnnotationsLength: annotationSend.browserAnnotations.length,
    setBrowserAnnotationTrayOpen: annotationSend.setBrowserAnnotationTrayOpen
  })

  const { browserAnnotations } = annotationSend
  const { pendingAnnotationPayload } = grabAnnotations
  useEffect(() => {
    if (!toolTargetId) {
      return
    }
    syncGuestAnnotationViewportBridge({
      toolTargetId,
      annotations: browserAnnotations,
      pendingPayload: pendingAnnotationPayload,
      surfaceActive: toolsReady,
      token: annotationViewportBridgeTokenRef.current
    })
  }, [browserAnnotations, pendingAnnotationPayload, toolTargetId, toolsReady])

  const elementTools = useMemo<BrowserChromeElementTools>(
    () => ({
      activeIntent: grab.state !== 'idle' ? grabAnnotations.grabIntent : null,
      onStartIntent: grabAnnotations.startGrabIntent,
      // Nothing has painted on a loading or failed preview, so there is no element to pick.
      disabled: !toolsReady || markup.isActive,
      grabShortcutLabel: grabElementShortcut,
      annotationCount: browserAnnotations.length
    }),
    [
      browserAnnotations.length,
      grab.state,
      grabAnnotations.grabIntent,
      grabAnnotations.startGrabIntent,
      grabElementShortcut,
      markup.isActive,
      toolsReady
    ]
  )

  return { grab, markup, annotationSend, grabAnnotations, browserOverlayViewport, elementTools }
}
