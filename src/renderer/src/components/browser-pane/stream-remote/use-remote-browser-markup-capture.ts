import { useCallback, type RefObject } from 'react'
import {
  useMarkupMode,
  type MarkupCaptureContext,
  type MarkupModeController
} from '../annotate/useMarkupMode'
import { deliverMarkupToClipboard } from '../annotate/markup-clipboard-delivery'

export function useRemoteBrowserMarkupCapture(
  imageRef: RefObject<HTMLImageElement | null>,
  viewportRef: RefObject<HTMLDivElement | null>
): MarkupModeController {
  return useMarkupMode({
    getCaptureContext: useCallback((): MarkupCaptureContext | null => {
      const element = imageRef.current
      const container = viewportRef.current
      if (!element || !container) {
        return null
      }
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        return null
      }
      return {
        source: { kind: 'image', element },
        cssWidth: rect.width,
        cssHeight: rect.height,
        outputScale: window.devicePixelRatio || 1
      }
    }, [imageRef, viewportRef]),
    onDeliver: deliverMarkupToClipboard
  })
}
