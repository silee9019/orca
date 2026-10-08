import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
export function useBrowserCookieSectionScroll() {
  const frames = useRef<number[]>([])
  const pending = useRef<((applied: boolean) => void) | null>(null)
  const [cookiesScrolled, setCookiesScrolled] = useState(false)
  const cancel = useCallback(() => {
    for (const frame of frames.current) {
      cancelAnimationFrame(frame)
    }
    frames.current = []
    pending.current?.(false)
    pending.current = null
  }, [])
  useEffect(() => cancel, [cancel])
  const setBrowserPaneRootNode = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) {
        cancel()
      }
    },
    [cancel]
  )
  const frame = (callback: () => void): void => {
    let completed = false
    let id: number | undefined
    id = requestAnimationFrame(() => {
      completed = true
      frames.current = frames.current.filter((value) => value !== id)
      callback()
    })
    if (!completed) {
      frames.current.push(id)
    }
  }
  const requestSessionCookieScroll = (expiresAt: number): Promise<boolean> => {
    if (Date.now() >= expiresAt) {
      return Promise.resolve(false)
    }
    cancel()
    setCookiesScrolled(false)
    useAppStore.getState().setSettingsSearchQuery('')
    return new Promise((resolve) => {
      pending.current = resolve
      frame(() =>
        frame(() => {
          const element = document.getElementById('browser-session-cookies')
          const applied = !!element && Date.now() < expiresAt
          if (applied) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          pending.current = null
          setCookiesScrolled(applied)
          resolve(applied)
        })
      )
    })
  }
  return {
    setBrowserPaneRootNode,
    scrollToSessionCookies: () => requestSessionCookieScroll(Infinity),
    requestSessionCookieScroll,
    cookiesScrolled
  }
}
