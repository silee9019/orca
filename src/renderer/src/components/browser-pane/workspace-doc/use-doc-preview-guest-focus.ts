import { useEffect, type RefObject } from 'react'

export function useDocPreviewGuestFocus(
  webviewRef: RefObject<Electron.WebviewTag | null>,
  holdsGuestFocus: boolean,
  previewId: string,
  remintCount: number,
  state: string
): void {
  useEffect(() => {
    if (!holdsGuestFocus || state !== 'ready') {
      return
    }
    let frameId = 0
    let attempts = 0
    let claimedOnly = false
    const focusGuest = (): void => {
      const webview = webviewRef.current
      attempts += 1
      if (
        claimedOnly &&
        document.activeElement !== document.body &&
        document.activeElement !== webview
      ) {
        return
      }
      try {
        webview?.focus()
      } catch {
        return
      }
      if (document.activeElement !== webview && attempts < 10) {
        frameId = window.requestAnimationFrame(focusGuest)
      }
    }
    const offerFocus = (yieldToOtherClaims: boolean): void => {
      window.cancelAnimationFrame(frameId)
      attempts = 0
      claimedOnly = yieldToOtherClaims
      frameId = window.requestAnimationFrame(focusGuest)
    }
    offerFocus(false)
    const reofferFocus = (): void => offerFocus(true)
    window.addEventListener('focus', reofferFocus)
    return () => {
      window.removeEventListener('focus', reofferFocus)
      window.cancelAnimationFrame(frameId)
    }
  }, [holdsGuestFocus, previewId, remintCount, state, webviewRef])
}
