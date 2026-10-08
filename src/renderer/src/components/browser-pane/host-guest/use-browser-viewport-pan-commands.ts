import { useEffect, useLayoutEffect, useRef } from 'react'
import { BROWSER_VIEWPORT_PAN_COMMAND_EVENT } from '@/runtime/browser-viewport-pan-request'
import {
  getBrowserPageViewportContainer,
  getBrowserPageViewportScrollState,
  scrollBrowserPageViewport
} from './browser-page-viewport'
export function useBrowserViewportPanCommands(
  page: string,
  active: boolean,
  preset: string | null,
  scroller: HTMLDivElement | null
): void {
  const current = useRef({ page, active, preset, scroller })
  useLayoutEffect(() => {
    current.current = { page, active, preset, scroller }
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-viewport-pan-command']): void => {
      const request = event.detail
      if (request.page !== current.current.page) {
        return
      }
      request.offer(current.current.active, () => {
        const owner = current.current
        if (
          !owner.active ||
          owner.page !== request.page ||
          !owner.scroller?.isConnected ||
          !getBrowserPageViewportContainer(owner.page)?.contains(owner.scroller)
        ) {
          request.finish(new Error('browser_viewport_pan_owner_unavailable'))
          return
        }
        if (!owner.preset) {
          request.finish(new Error('browser_viewport_pan_preset_required'))
          return
        }
        const before = getBrowserPageViewportScrollState(owner.page)
        if (!before) {
          request.finish(new Error('browser_viewport_pan_ui_unavailable'))
          return
        }
        scrollBrowserPageViewport(owner.page, request.delta.deltaX, request.delta.deltaY)
        const after = getBrowserPageViewportScrollState(owner.page)
        const expectedLeft = Math.max(
          0,
          Math.min(before.maxScrollLeft, before.scrollLeft + request.delta.deltaX)
        )
        const expectedTop = Math.max(
          0,
          Math.min(before.maxScrollTop, before.scrollTop + request.delta.deltaY)
        )
        if (
          !after ||
          current.current.scroller !== owner.scroller ||
          Math.abs(after.scrollLeft - expectedLeft) > 1 ||
          Math.abs(after.scrollTop - expectedTop) > 1
        ) {
          request.finish(new Error('browser_viewport_pan_owner_changed_effect_unknown'))
          return
        }
        request.finish(undefined, {
          page: owner.page,
          delta: request.delta,
          before,
          after,
          accepted: true
        })
      })
    }
    window.addEventListener(BROWSER_VIEWPORT_PAN_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_VIEWPORT_PAN_COMMAND_EVENT, receive)
  }, [])
}
