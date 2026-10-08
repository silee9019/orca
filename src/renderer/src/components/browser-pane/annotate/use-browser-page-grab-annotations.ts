import { useBrowserGrabClipboard } from './use-browser-grab-clipboard'
import { useBrowserAnnotationDraftCommands } from './use-browser-annotation-draft-commands'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react'
import { useBrowserGrabIntentCommands } from './use-browser-grab-intent-commands'
import {
  copiedGrabToastMessage,
  annotationAddedGrabToastMessage
} from './browser-grab-toast-messages'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '@/store'
import type {
  BrowserAnnotationIntent,
  BrowserGrabPayload
} from '../../../../../shared/browser-grab-types'
import { formatGrabPayloadAsText } from './GrabConfirmationSheet'
import {
  createBrowserAnnotationId,
  createBrowserAnnotationPayload,
  DEFAULT_BROWSER_ANNOTATION_PRIORITY
} from '../describe-page/browser-annotation-geometry'
import { useBrowserPageAnnotationViewportTracking } from './use-browser-page-annotation-viewport-tracking'
import { useBrowserGrabActionCommands } from './use-browser-grab-action-commands'
import type {
  BrowserPageGrabAnnotationsOptions,
  BrowserPageGrabToastState,
  GrabIntent
} from '../describe-page/browser-page-types'

export function useBrowserPageGrabAnnotations({
  browserTabId,
  toolTargetId = browserTabId,
  isActive,
  markupIsActive = false,
  grabCommandDisabled = false,
  grabActionCommandOwner,
  grab,
  containerRef,
  trackingContainer,
  trackingScroller,
  webviewRef,
  setBrowserOverlayViewport,
  browserAnnotationsLength,
  setBrowserAnnotationTrayOpen
}: BrowserPageGrabAnnotationsOptions): {
  grabIntent: GrabIntent
  startGrabIntent: (nextIntent: GrabIntent) => void | Promise<boolean>
  pendingAnnotationPayload: BrowserGrabPayload | null
  setPendingAnnotationPayload: Dispatch<SetStateAction<BrowserGrabPayload | null>>
  grabToast: BrowserPageGrabToastState | null
  setGrabToast: Dispatch<SetStateAction<BrowserPageGrabToastState | null>>
  grabToastTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | undefined>
  dismissGrabToast: () => void
  handleGrabCopy: () => void
  handleGrabCopyScreenshot: () => void
  grabMenuActionTakenRef: MutableRefObject<boolean>
  handleAddBrowserAnnotation: (
    comment: string,
    intent: BrowserAnnotationIntent
  ) => string | undefined
  handleCancelPendingBrowserAnnotation: () => void
  cancelPendingBrowserCapture: () => void
  handleGrabActionShortcut: (key: 'c' | 's') => void
} {
  const mountedRef = useMountedRef()
  const toolTargetIdRef = useRef(toolTargetId)
  const grabToastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [grabIntent, setGrabIntent] = useState<GrabIntent>('copy')
  const grabIntentRef = useRef(grabIntent)
  const [pendingAnnotationPayload, setPendingAnnotationPayload] =
    useState<BrowserGrabPayload | null>(null)
  const pendingAnnotationPayloadRef = useRef<BrowserGrabPayload | null>(null)
  // Inline toast near the grabbed element (below, or above near the viewport bottom) so it doesn't occlude the selection.
  const [grabToast, setGrabToast] = useState<BrowserPageGrabToastState | null>(null)
  const grabRef = useRef(grab)
  const grabPayloadRef = useRef(grab.payload)

  useLayoutEffect(() => {
    toolTargetIdRef.current = toolTargetId
    grabIntentRef.current = grabIntent
    pendingAnnotationPayloadRef.current = pendingAnnotationPayload
    grabRef.current = grab
    grabPayloadRef.current = grab.payload
  }, [grab, grabIntent, pendingAnnotationPayload, toolTargetId])
  // Why: Radix fires onOpenChange(false) before onSelect, so this flag lets onOpenChange skip the rearm that would clear the payload first.
  const grabMenuActionTakenRef = useRef(false)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const addBrowserPageAnnotation = useAppStore((s) => s.addBrowserPageAnnotation)

  useEffect(() => () => clearTimeout(grabToastTimerRef.current), [])

  const dismissGrabToast = useCallback(() => {
    clearTimeout(grabToastTimerRef.current)
    setGrabToast(null)
    // Why: only rearm while 'confirming'; if a C/S shortcut already rearmed (state 'armed'), skip to avoid a double-rearm race.
    if (
      grabRef.current.state === 'confirming' &&
      !(grabIntentRef.current === 'annotate' && pendingAnnotationPayloadRef.current)
    ) {
      grabRef.current.rearm()
    }
  }, [])

  const showGrabToast = useCallback(
    (message: string, type: 'success' | 'error', payload?: BrowserGrabPayload | null) => {
      if (!mountedRef.current) {
        return
      }
      let x = 0
      let y = 0
      let below = true
      const containerRect = containerRef.current?.getBoundingClientRect()
      if (payload) {
        const rect = payload.target.rectViewport
        const webview = webviewRef.current
        const webviewRect = webview?.getBoundingClientRect()
        const offsetX = (webviewRect?.left ?? 0) - (containerRect?.left ?? 0)
        const offsetY = (webviewRect?.top ?? 0) - (containerRect?.top ?? 0)
        x = offsetX + rect.x + rect.width / 2
        const elementBottom = offsetY + rect.y + rect.height
        const elementTop = offsetY + rect.y
        const containerHeight = containerRect?.height ?? 0
        // Show below the element unless it's too close to the bottom edge
        below = elementBottom + 52 < containerHeight
        y = below ? elementBottom : elementTop
      } else if (containerRect) {
        x = containerRect.width / 2
        y = containerRect.height / 2
      }
      clearTimeout(grabToastTimerRef.current)
      setGrabToast({ message, type, x, y, below, payload: payload ?? null })
      grabToastTimerRef.current = setTimeout(() => dismissGrabToast(), 2000)
    },
    [containerRef, dismissGrabToast, mountedRef, webviewRef]
  )

  // The picker supports clipboard copying and independently dismissible annotation drafts.
  useEffect(() => {
    if (grab.state !== 'confirming' || !grab.payload) {
      return
    }
    if (grabIntent === 'annotate') {
      // Loading may cancel the selection before React accepts this pending snapshot.
      setPendingAnnotationPayload(() =>
        grabPayloadRef.current === grab.payload ? grab.payload : null
      )
      return
    }
    if (!grab.contextMenu) {
      const text = formatGrabPayloadAsText(grab.payload)
      void window.api.ui.writeClipboardText(text)
      recordFeatureInteraction('browser-grab')
      showGrabToast(copiedGrabToastMessage(), 'success', grab.payload)
    }
  }, [
    grab.state,
    grab.payload,
    grab.contextMenu,
    grabIntent,
    recordFeatureInteraction,
    showGrabToast
  ])

  useBrowserPageAnnotationViewportTracking({
    isActive,
    pendingAnnotation: pendingAnnotationPayload,
    annotationCount: browserAnnotationsLength,
    container: trackingContainer ?? containerRef.current,
    scroller:
      trackingScroller ??
      containerRef.current?.querySelector<HTMLDivElement>('[data-browser-page-scroller]') ??
      null,
    setBrowserOverlayViewport
  })

  const startGrabIntent = useCallback(
    (nextIntent: GrabIntent): void | Promise<boolean> => {
      recordFeatureInteraction('browser-grab')
      if (nextIntent === 'annotate') {
        recordFeatureInteraction('browser-annotations')
      }
      setGrabIntent(nextIntent)
      if (nextIntent === 'copy') {
        setPendingAnnotationPayload(null)
      } else {
        setBrowserAnnotationTrayOpen(true)
      }
      if (grab.state === 'idle' || grab.state === 'error' || grabIntent === nextIntent) {
        return grab.toggle()
      }
    },
    [grab, grabIntent, recordFeatureInteraction, setBrowserAnnotationTrayOpen]
  )

  useBrowserGrabIntentCommands(
    toolTargetId,
    isActive,
    grab,
    grabIntent,
    startGrabIntent,
    markupIsActive,
    grabCommandDisabled
  )

  const handleGrabActionShortcut = useBrowserGrabActionCommands({
    commandOwner: grabActionCommandOwner,
    markupIsActive,
    grabIntent,
    grab,
    grabPayloadRef,
    toolTargetIdRef,
    recordFeatureInteraction,
    showGrabToast
  })

  const { handleGrabCopy, handleGrabCopyScreenshot } = useBrowserGrabClipboard({
    page: toolTargetId,
    isActive,
    grab,
    payloadRef: grabPayloadRef,
    menuActionTaken: grabMenuActionTakenRef,
    record: recordFeatureInteraction,
    toast: showGrabToast
  })

  const handleAddBrowserAnnotation = useCallback(
    (comment: string, intent: BrowserAnnotationIntent): string | undefined => {
      const payload = pendingAnnotationPayloadRef.current
      if (!payload) {
        return
      }
      const annotationId = createBrowserAnnotationId()
      addBrowserPageAnnotation({
        id: annotationId,
        browserPageId: browserTabId,
        comment,
        intent,
        priority: DEFAULT_BROWSER_ANNOTATION_PRIORITY,
        createdAt: new Date().toISOString(),
        payload: createBrowserAnnotationPayload(payload)
      })
      recordFeatureInteraction('browser-annotations')
      pendingAnnotationPayloadRef.current = null
      setPendingAnnotationPayload(null)
      setBrowserAnnotationTrayOpen(true)
      showGrabToast(annotationAddedGrabToastMessage(), 'success', payload)
      grab.rearm()
      return annotationId
    },
    [
      addBrowserPageAnnotation,
      browserTabId,
      grab,
      recordFeatureInteraction,
      setBrowserAnnotationTrayOpen,
      showGrabToast
    ]
  )

  const handleCancelPendingBrowserAnnotation = useCallback((): void => {
    pendingAnnotationPayloadRef.current = null
    setPendingAnnotationPayload(null)
    if (grabIntent === 'annotate' && grab.state === 'confirming') {
      grab.rearm()
    }
  }, [grab, grabIntent])

  useBrowserAnnotationDraftCommands(
    toolTargetId,
    isActive,
    pendingAnnotationPayloadRef,
    handleAddBrowserAnnotation,
    handleCancelPendingBrowserAnnotation
  )

  const cancelPendingBrowserCapture = useCallback((): void => {
    grabRef.current.cancel()
    pendingAnnotationPayloadRef.current = null
    grabPayloadRef.current = null
    setPendingAnnotationPayload(null)
    clearTimeout(grabToastTimerRef.current)
    setGrabToast(null)
  }, [])

  return {
    grabIntent,
    startGrabIntent,
    pendingAnnotationPayload,
    setPendingAnnotationPayload,
    grabToast,
    setGrabToast,
    grabToastTimerRef,
    dismissGrabToast,
    handleGrabCopy,
    handleGrabCopyScreenshot,
    grabMenuActionTakenRef,
    handleAddBrowserAnnotation,
    handleCancelPendingBrowserAnnotation,
    cancelPendingBrowserCapture,
    handleGrabActionShortcut
  }
}
