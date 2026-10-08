// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useBrowserCookieSectionScroll } from './use-browser-cookie-section-scroll'
const state = vi.hoisted(() => ({ query: 'cookies' }))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      setSettingsSearchQuery: (value: string) => {
        state.query = value
      }
    })
  }
}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})
it('cancels replaced/unmounted scrolls and refuses expired requests before clearing the search', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const frames = new Map<number, FrameRequestCallback>()
  let sequence = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback)
    return sequence
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  const scroll = vi.fn()
  const container = document.createElement('div')
  const target = document.createElement('div')
  target.id = 'browser-session-cookies'
  target.scrollIntoView = scroll
  document.body.append(container, target)
  let current: ReturnType<typeof useBrowserCookieSectionScroll> | undefined
  function Owner() {
    current = useBrowserCookieSectionScroll()
    return createElement('div', { ref: current.setBrowserPaneRootNode })
  }
  const root = createRoot(container)
  await act(async () => root.render(createElement(Owner)))
  if (!current) {
    throw new Error('Scroll owner missing')
  }
  expect(await current.requestSessionCookieScroll(Date.now() - 1)).toBe(false)
  expect(state.query).toBe('cookies')
  let first: Promise<boolean> | undefined
  let second: Promise<boolean> | undefined
  await act(async () => {
    first = current?.requestSessionCookieScroll(Date.now() + 1000)
    second = current?.scrollToSessionCookies()
  })
  expect(await first).toBe(false)
  const flush = async () =>
    act(async () => {
      const next = [...frames.entries()]
      for (const [id, callback] of next) {
        frames.delete(id)
        callback(performance.now())
      }
    })
  await flush()
  await flush()
  expect(await second).toBe(true)
  expect(scroll).toHaveBeenCalledOnce()
  expect(state.query).toBe('')
  expect(current.cookiesScrolled).toBe(true)
  let disposed: Promise<boolean> | undefined
  await act(async () => {
    disposed = current?.scrollToSessionCookies()
  })
  await act(async () => root.unmount())
  expect(await disposed).toBe(false)
  expect(frames.size).toBe(0)
  expect(scroll).toHaveBeenCalledOnce()
})
