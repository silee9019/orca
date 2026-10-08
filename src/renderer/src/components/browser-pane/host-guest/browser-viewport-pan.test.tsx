// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { requestBrowserViewportPan } from '@/runtime/browser-viewport-pan-request'
import { useBrowserViewportPanCommands } from './use-browser-viewport-pan-commands'
import * as viewportApi from './browser-page-viewport'
import {
  ensureBrowserPageViewport,
  registerBrowserOverlaySlotViewport,
  removeBrowserPageViewport,
  getBrowserPageViewportScrollState
} from './browser-page-viewport'
afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
  removeBrowserPageViewport('page')
  registerBrowserOverlaySlotViewport('tab', null)
  document.body.replaceChildren()
})
function mount(active = true, preset: string | null = 'desktop') {
  const root = document.createElement('div')
  document.body.append(root)
  registerBrowserOverlaySlotViewport('tab', root)
  const viewport = ensureBrowserPageViewport('page', 'tab')
  if (!viewport) {
    throw new Error('viewport missing')
  }
  Object.defineProperties(viewport.scroller, {
    scrollWidth: { value: 900, configurable: true },
    clientWidth: { value: 300, configurable: true },
    scrollHeight: { value: 800, configurable: true },
    clientHeight: { value: 200, configurable: true }
  })
  let left = 0
  let top = 0
  Object.defineProperties(viewport.scroller, {
    scrollLeft: {
      get: () => left,
      set: (value: number) => {
        left = Math.max(0, Math.min(600, value))
      }
    },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, Math.min(600, value))
      }
    }
  })
  function Owner() {
    useBrowserViewportPanCommands('page', active, preset, viewport?.scroller ?? null)
    return null
  }
  return render(<Owner />)
}
const pan = (deltaX = 40, deltaY = 80) =>
  requestBrowserViewportPan('page', { deltaX, deltaY }, Date.now() + 1000)
it('uses the existing host viewport scroller and reads the clamped DOM position', async () => {
  mount()
  expect(await pan()).toMatchObject({
    page: 'page',
    before: { scrollLeft: 0, scrollTop: 0 },
    after: { scrollLeft: 40, scrollTop: 80 },
    accepted: true
  })
  expect(await pan(900, -900)).toMatchObject({ after: { scrollLeft: 600, scrollTop: 0 } })
  expect(getBrowserPageViewportScrollState('page')).toMatchObject({ scrollLeft: 600, scrollTop: 0 })
})
it('rejects inactive and default viewport owners without moving the DOM', async () => {
  const view = mount(false)
  await expect(pan()).rejects.toThrow('inactive')
  expect(getBrowserPageViewportScrollState('page')?.scrollLeft).toBe(0)
  view.unmount()
  mount(true, null)
  await expect(pan()).rejects.toThrow('preset_required')
})
it('refuses duplicate active owners before either callback changes the scroller', async () => {
  mount()
  mount()
  await expect(pan()).rejects.toThrow('ambiguous')
  expect(getBrowserPageViewportScrollState('page')?.scrollLeft).toBe(0)
})
it('rejects expired, nonfinite and absent-owner requests', async () => {
  await expect(pan()).rejects.toThrow('unavailable')
  mount()
  await expect(
    requestBrowserViewportPan('page', { deltaX: 1, deltaY: 2 }, Date.now() - 1)
  ).rejects.toThrow('expired')
  await expect(pan(Number.NaN)).rejects.toThrow()
  expect(getBrowserPageViewportScrollState('page')?.scrollLeft).toBe(0)
})

it('does not accept a no-op scrolling provider as a completed pan', async () => {
  mount()
  vi.spyOn(viewportApi, 'scrollBrowserPageViewport').mockImplementation(() => {})
  await expect(pan()).rejects.toThrow('effect_unknown')
})
