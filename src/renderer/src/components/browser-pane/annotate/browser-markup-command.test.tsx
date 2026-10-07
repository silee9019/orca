// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  requestBrowserMarkup,
  type BrowserMarkupEvent,
  type BrowserMarkupState
} from '@/runtime/browser-markup-request'
import { useMarkupMode } from './useMarkupMode'
import { useBrowserMarkupCommands } from './use-browser-markup-commands'
const fixture = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('./markup-base-image', () => ({ captureMarkupBaseImage: fixture.capture }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
beforeEach(() => fixture.capture.mockResolvedValue({ dataUrl: 'fixture', width: 100, height: 80 }))
afterEach(cleanup)
function mount(active = true) {
  return renderHook(() => {
    const mode = useMarkupMode({
      getCaptureContext: () => ({
        source: { kind: 'image', element: new Image() },
        cssWidth: 100,
        cssHeight: 80,
        outputScale: 1
      }),
      onDeliver: vi.fn()
    })
    useBrowserMarkupCommands('p1', active, mode)
    return mode
  })
}
async function command(action: BrowserMarkupEvent['action']) {
  let result: Promise<BrowserMarkupState> | undefined
  await act(async () => {
    result = requestBrowserMarkup('p1', action, Date.now() + 5000)
    void result.catch(() => {})
  })
  if (!result) {
    throw new Error('missing markup request')
  }
  return result
}
it('captures through the original mode owner and acknowledges drawing and cancellation state', async () => {
  const mode = mount()
  expect(await command('start')).toEqual({ state: 'drawing', hasImage: true })
  expect(fixture.capture).toHaveBeenCalledOnce()
  expect(mode.result.current.state).toBe('drawing')
  expect(await command('status')).toEqual({ state: 'drawing', hasImage: true })
  expect(await command('cancel')).toEqual({ state: 'idle', hasImage: false })
})
it('rejects capture failure, inactive, expired and foreign-page requests', async () => {
  const owner = mount()
  fixture.capture.mockRejectedValueOnce(new Error('capture failed'))
  await expect(command('start')).rejects.toThrow('browser_markup_capture_failed')
  await expect(requestBrowserMarkup('other', 'status', Date.now() + 5000)).rejects.toThrow(
    'browser_markup_ui_unavailable'
  )
  await expect(requestBrowserMarkup('p1', 'start', 0)).rejects.toThrow('request_expired')
  owner.unmount()
  mount(false)
  await expect(command('start')).rejects.toThrow('browser_markup_viewer_inactive')
})
it('cancels in-flight capture without reviving a stale drawing session', async () => {
  let completeCapture: (image: { dataUrl: string; width: number; height: number }) => void = () => {
    throw new Error('capture not started')
  }
  fixture.capture.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        completeCapture = resolve
      })
  )
  const owner = mount()
  let started: Promise<BrowserMarkupState> | undefined
  await act(async () => {
    started = requestBrowserMarkup('p1', 'start', Date.now() + 5000)
    void started.catch(() => {})
  })
  if (!started) {
    throw new Error('missing start request')
  }
  expect(owner.result.current.state).toBe('capturing')
  await expect(command('start')).rejects.toThrow('browser_markup_already_active')
  expect(await command('cancel')).toEqual({ state: 'idle', hasImage: false })
  await expect(started).rejects.toThrow('browser_markup_cancelled')
  await act(async () => completeCapture({ dataUrl: 'stale', width: 100, height: 80 }))
  expect(owner.result.current.state).toBe('idle')
  expect(owner.result.current.baseImage).toBeNull()
})
it('rejects the pending request when its page owner unmounts', async () => {
  fixture.capture.mockImplementationOnce(() => new Promise(() => {}))
  const owner = mount()
  let pending: Promise<BrowserMarkupState> | undefined
  await act(async () => {
    pending = requestBrowserMarkup('p1', 'start', Date.now() + 5000)
    void pending.catch(() => {})
  })
  owner.unmount()
  if (!pending) {
    throw new Error('missing pending request')
  }
  await expect(pending).rejects.toThrow('browser_markup_ui_unavailable')
})

it('selects the active markup owner after an inactive owner without starting the latter', async () => {
  const inactive = mount(false)
  const active = mount(true)
  fixture.capture.mockClear()
  await expect(command('start')).resolves.toEqual({ state: 'drawing', hasImage: true })
  expect(inactive.result.current.state).toBe('idle')
  expect(active.result.current.state).toBe('drawing')
  expect(fixture.capture).toHaveBeenCalledOnce()
})
it('rejects duplicate active markup owners before capture or cancellation', async () => {
  const first = mount()
  const second = mount()
  fixture.capture.mockClear()
  await expect(command('start')).rejects.toThrow('browser_markup_owner_ambiguous')
  expect(fixture.capture).not.toHaveBeenCalled()
  await act(async () => first.result.current.start())
  expect(first.result.current.state).toBe('drawing')
  await expect(command('cancel')).rejects.toThrow('browser_markup_owner_ambiguous')
  expect(first.result.current.state).toBe('drawing')
  expect(second.result.current.state).toBe('idle')
})
