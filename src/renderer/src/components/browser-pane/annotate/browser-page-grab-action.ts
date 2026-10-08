import { writeVerifiedClipboardText } from '@/runtime/clipboard-text-write'
import type { MutableRefObject } from 'react'
import type { BrowserGrabPayload } from '../../../../../shared/browser-grab-types'
import { formatGrabPayloadAsText } from './GrabConfirmationSheet'
import type { GrabModeHook } from './useGrabMode'
import type { BrowserPageGrabToastState, GrabIntent } from '../describe-page/browser-page-types'

export type BrowserGrabActionArgs = {
  key: 'c' | 's'
  grabIntent: GrabIntent
  grab: GrabModeHook
  grabPayloadRef: MutableRefObject<BrowserGrabPayload | null>
  toolTargetIdRef: MutableRefObject<string>
  recordFeatureInteraction: (feature: 'browser-grab') => void | Promise<void>
  showGrabToast: (
    message: string,
    type: BrowserPageGrabToastState['type'],
    payload?: BrowserGrabPayload | null
  ) => void
}
export type BrowserGrabActionOutcome = {
  copied: boolean
  source: 'hover' | 'selection'
  rearmed: boolean
}
type VerifiedAction = { stillCurrent: () => boolean }
export function runBrowserGrabActionShortcut(
  args: BrowserGrabActionArgs & { verified: VerifiedAction }
): Promise<BrowserGrabActionOutcome>
export function runBrowserGrabActionShortcut(args: BrowserGrabActionArgs): void
export function runBrowserGrabActionShortcut({
  key,
  grabIntent,
  grab,
  grabPayloadRef,
  toolTargetIdRef,
  recordFeatureInteraction,
  showGrabToast,
  verified
}: BrowserGrabActionArgs & {
  verified?: VerifiedAction
}): void | Promise<BrowserGrabActionOutcome> {
  const missed = (source: 'hover' | 'selection'): BrowserGrabActionOutcome => ({
    copied: false,
    source,
    rearmed: false
  })
  if (grabIntent === 'annotate') {
    return verified ? Promise.resolve(missed('hover')) : undefined
  }
  const copyFromPayload = (payload: BrowserGrabPayload): void | Promise<boolean> => {
    const dataUrl = payload.screenshot?.dataUrl
    if (verified) {
      return (async () => {
        if (!verified.stillCurrent()) {
          return false
        }
        if (key === 'c') {
          if (!(await writeVerifiedClipboardText(formatGrabPayloadAsText(payload)))) {
            return false
          }
        } else {
          if (!dataUrl?.startsWith('data:image/png;base64,')) {
            return false
          }
          const ack = await window.api.ui.writeVerifiedClipboardImage(dataUrl)
          if (ack?.written !== true) {
            return false
          }
        }
        if (!verified.stillCurrent()) {
          return false
        }
        recordFeatureInteraction('browser-grab')
        showGrabToast(key === 'c' ? 'Copied' : 'Screenshotted', 'success', payload)
        return true
      })()
    }
    if (key === 'c') {
      void window.api.ui.writeClipboardText(formatGrabPayloadAsText(payload))
      recordFeatureInteraction('browser-grab')
      showGrabToast('Copied', 'success', payload)
    } else if (dataUrl?.startsWith('data:image/png;base64,')) {
      void window.api.ui.writeClipboardImage(dataUrl)
      recordFeatureInteraction('browser-grab')
      showGrabToast('Screenshotted', 'success', payload)
    } else {
      showGrabToast('No screenshot available', 'error', payload)
    }
  }
  if (grab.state === 'confirming') {
    if ((grab.contextMenu && key === 'c') || key === 's') {
      const payload = grabPayloadRef.current
      if (verified) {
        return (async () => {
          if (!payload || !(await copyFromPayload(payload)) || !verified.stillCurrent()) {
            return missed('selection')
          }
          grab.rearm()
          return { copied: true, source: 'selection', rearmed: true }
        })()
      }
      if (payload) {
        copyFromPayload(payload)
      }
      grab.rearm()
    }
    return verified ? Promise.resolve(missed('selection')) : undefined
  }
  const page = toolTargetIdRef.current
  const run = async (): Promise<BrowserGrabActionOutcome> => {
    let result: Awaited<ReturnType<typeof window.api.browser.extractHoverPayload>>
    try {
      result = await window.api.browser.extractHoverPayload({ browserPageId: page })
    } catch {
      if (!verified) {
        showGrabToast('Could not read the hovered element', 'error')
      }
      return missed('hover')
    }
    if (!result.ok) {
      if (!verified) {
        showGrabToast('No element hovered', 'error')
      }
      return missed('hover')
    }
    if (verified && !verified.stillCurrent()) {
      return missed('hover')
    }
    const payload = result.payload
    if (key === 's') {
      try {
        const screenshot = await window.api.browser.captureSelectionScreenshot({
          browserPageId: verified ? page : toolTargetIdRef.current,
          rect: payload.target.rectViewport
        })
        if (screenshot.ok) {
          payload.screenshot = screenshot.screenshot
        } else if (verified) {
          return missed('hover')
        }
      } catch {
        if (verified) {
          return missed('hover')
        }
      }
    }
    if (verified && !verified.stillCurrent()) {
      return missed('hover')
    }
    const copied = await copyFromPayload(payload)
    return { copied: verified ? copied === true : true, source: 'hover', rearmed: false }
  }
  if (verified) {
    return run()
  }
  void run()
}
