// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { requestBrowserGrab, type BrowserGrabState } from '@/runtime/browser-grab-request'
import type { BrowserGrabViewerAction } from '../../../../../shared/rpc-contract/browser-viewer-params'
import type { BrowserGrabResult } from '../../../../../shared/browser-grab-types'
import { useGrabMode } from './useGrabMode'
const api = {
  setGrabMode: vi.fn().mockResolvedValue({ ok: true }),
  cancelGrab: vi.fn().mockResolvedValue(true),
  awaitGrabSelection: vi.fn(() => new Promise<BrowserGrabResult>(() => {})),
  captureSelectionScreenshot: vi.fn()
}
beforeEach(() => {
  vi.clearAllMocks()
  api.setGrabMode.mockResolvedValue({ ok: true })
  api.cancelGrab.mockResolvedValue(true)
  Object.defineProperty(window, 'api', { value: { browser: api }, configurable: true })
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'api')
})
async function command(action: BrowserGrabViewerAction): Promise<BrowserGrabState> {
  let result: Promise<BrowserGrabState> | undefined
  await act(async () => {
    result = requestBrowserGrab('p1', action, Date.now() + 9000)
    void result.catch(() => {})
  })
  if (!result) {
    throw new Error('missing request')
  }
  return result
}
it('arms the existing picker, reads awaiting state, and cancels the native operation', async () => {
  renderHook(() => useGrabMode('p1'))
  expect(await command('start')).toMatchObject({ state: 'awaiting', hasSelection: false })
  expect(api.setGrabMode).toHaveBeenCalledWith({ browserPageId: 'p1', enabled: true })
  expect(api.awaitGrabSelection).toHaveBeenCalledWith({
    browserPageId: 'p1',
    opId: expect.any(String)
  })
  expect(await command('status')).toMatchObject({ state: 'awaiting' })
  expect(await command('cancel')).toMatchObject({ state: 'idle' })
  expect(api.cancelGrab).toHaveBeenCalledWith({ browserPageId: 'p1' })
  expect(api.setGrabMode).toHaveBeenLastCalledWith({ browserPageId: 'p1', enabled: false })
})
it('rejects native picker failure, invalid rearm, expired requests and foreign page', async () => {
  renderHook(() => useGrabMode('p1'))
  api.setGrabMode.mockResolvedValueOnce({ ok: false, reason: 'injection-failed' })
  await expect(command('start')).rejects.toThrow('browser_grab_start_failed')
  await expect(command('rearm')).rejects.toThrow('browser_grab_not_confirming')
  await expect(requestBrowserGrab('p1', 'start', Date.now() - 1)).rejects.toThrow('request_expired')
  await expect(requestBrowserGrab('other', 'start', Date.now() + 9000)).rejects.toThrow(
    'browser_grab_ui_unavailable'
  )
})

it('does not report refused native cancellation or rejected picker enable as successful', async () => {
  renderHook(() => useGrabMode('p1'))
  await command('start')
  api.cancelGrab.mockResolvedValueOnce(false)
  await expect(command('cancel')).rejects.toThrow('browser_grab_native_rejected')
  api.setGrabMode.mockRejectedValueOnce(new Error('fixture transport failure'))
  await expect(command('start')).rejects.toThrow('browser_grab_start_failed')
})
it('keeps the existing selection/screenshot lifecycle and re-arms then exits it', async () => {
  let choose: (result: BrowserGrabResult) => void = () => {
    throw new Error('selection not awaiting')
  }
  api.awaitGrabSelection.mockImplementationOnce(
    () =>
      new Promise<BrowserGrabResult>((resolve) => {
        choose = resolve
      })
  )
  api.captureSelectionScreenshot.mockResolvedValueOnce({
    ok: true,
    screenshot: {
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,fixture',
      width: 10,
      height: 10
    }
  })
  renderHook(() => useGrabMode('p1'))
  await command('start')
  await act(async () => {
    choose({
      opId: 'fixture',
      kind: 'selected',
      payload: {
        page: {
          sanitizedUrl: 'https://fixture.invalid',
          title: 'Fixture',
          viewportWidth: 100,
          viewportHeight: 100,
          scrollX: 0,
          scrollY: 0,
          devicePixelRatio: 1,
          capturedAt: '2026-10-08T01:15:00+09:00'
        },
        target: {
          tagName: 'button',
          selector: '#fixture',
          textSnippet: 'Fixture',
          htmlSnippet: '<button>Fixture</button>',
          attributes: {},
          accessibility: {
            role: 'button',
            accessibleName: 'Fixture',
            ariaLabel: null,
            ariaLabelledBy: null
          },
          rectViewport: { x: 1, y: 2, width: 10, height: 10 },
          rectPage: { x: 1, y: 2, width: 10, height: 10 },
          computedStyles: {
            display: 'block',
            position: 'static',
            width: '10px',
            height: '10px',
            margin: '0',
            padding: '0',
            color: 'black',
            backgroundColor: 'white',
            border: 'none',
            borderRadius: '0',
            fontFamily: 'sans-serif',
            fontSize: '12px',
            fontWeight: '400',
            lineHeight: '1',
            textAlign: 'left',
            zIndex: 'auto'
          }
        },
        nearbyText: [],
        ancestorPath: [],
        screenshot: null
      }
    })
  })
  expect(await command('status')).toEqual({
    state: 'confirming',
    hasSelection: true,
    hasScreenshot: true,
    contextMenu: false
  })
  expect(api.captureSelectionScreenshot).toHaveBeenCalledWith({
    browserPageId: 'p1',
    rect: { x: 1, y: 2, width: 10, height: 10 }
  })
  expect(await command('rearm')).toMatchObject({ state: 'awaiting', hasSelection: false })
  expect(await command('exit')).toMatchObject({ state: 'idle', hasSelection: false })
  expect(api.setGrabMode).toHaveBeenLastCalledWith({ browserPageId: 'p1', enabled: false })
})
