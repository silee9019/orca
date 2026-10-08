// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createTestStore } from '@/store/slices/browser-slice-test-harness'
import { makeAnnotation } from '@/store/slices/browser-annotation-test-fixture'
import { requestBrowserGrabAction } from '@/runtime/browser-grab-action-request'
import type { BrowserGrabResult } from '../../../../../shared/browser-grab-types'
import { useGrabMode } from './useGrabMode'
import { useBrowserPageGrabAnnotations } from './use-browser-page-grab-annotations'
const fixture = vi.hoisted((): { store?: ReturnType<typeof createTestStore> } => ({}))
vi.mock('@/store', () => ({
  useAppStore: (
    selector: (state: ReturnType<ReturnType<typeof createTestStore>['getState']>) => unknown
  ) => {
    if (!fixture.store) {
      throw new Error('missing store')
    }
    return fixture.store(selector)
  }
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
const payload = makeAnnotation('p1').payload
const screenshot = {
  mimeType: 'image/png',
  dataUrl: 'data:image/png;base64,fixture',
  width: 10,
  height: 10
} as const
let clipboard = ''
const api = {
  setGrabMode: vi.fn().mockResolvedValue({ ok: true }),
  cancelGrab: vi.fn().mockResolvedValue(true),
  awaitGrabSelection: vi.fn(() => new Promise<BrowserGrabResult>(() => {})),
  extractHoverPayload: vi.fn(),
  captureSelectionScreenshot: vi.fn(),
  writeClipboardText: vi.fn(),
  readClipboardText: vi.fn(),
  writeVerifiedClipboardImage: vi.fn(),
  writeClipboardImage: vi.fn()
}
beforeEach(() => {
  vi.clearAllMocks()
  fixture.store = createTestStore()
  clipboard = ''
  api.extractHoverPayload.mockResolvedValue({ ok: true, payload })
  api.captureSelectionScreenshot.mockResolvedValue({ ok: true, screenshot })
  api.writeVerifiedClipboardImage.mockResolvedValue({ written: true })
  api.writeClipboardText.mockImplementation(async (text: string) => {
    clipboard = text
  })
  api.readClipboardText.mockImplementation(async () => clipboard)
  Object.defineProperty(window, 'api', { configurable: true, value: { browser: api, ui: api } })
})
afterEach(cleanup)
function mount(active = true, markup = false, commandOwner = true) {
  return renderHook(
    ({ active, markup }) => {
      const grab = useGrabMode('p1')
      const annotations = useBrowserPageGrabAnnotations({
        browserTabId: 'p1',
        grabActionCommandOwner: commandOwner ? { page: 'p1', active } : undefined,
        isActive: active,
        markupIsActive: markup,
        grab,
        containerRef: { current: null },
        webviewRef: { current: null },
        setBrowserOverlayViewport: vi.fn(),
        setBrowserAnnotationTrayOpen: vi.fn(),
        browserAnnotationsLength: 0
      })
      return { grab, annotations }
    },
    { initialProps: { active, markup } }
  )
}
async function start(owner: ReturnType<typeof mount>) {
  act(() => {
    void owner.result.current.annotations.startGrabIntent('copy')
  })
  await waitFor(() => expect(owner.result.current.grab.state).toBe('awaiting'))
}
async function command(key: 'copy' | 'screenshot') {
  let response: ReturnType<typeof requestBrowserGrabAction> | undefined
  await act(async () => {
    response = requestBrowserGrabAction('p1', key, Date.now() + 5000)
    void response.catch(() => {})
  })
  if (!response) {
    throw new Error('missing request')
  }
  return response
}
it('copies a hovered element through the original grab annotation owner with text readback', async () => {
  const owner = mount()
  await start(owner)
  await expect(command('copy')).resolves.toMatchObject({
    copied: true,
    source: 'hover',
    state: 'awaiting'
  })
  expect(api.extractHoverPayload).toHaveBeenCalledWith({ browserPageId: 'p1' })
  expect(api.readClipboardText).toHaveBeenCalledOnce()
  expect(clipboard).toContain(payload.target.textSnippet)
  expect(api.captureSelectionScreenshot).not.toHaveBeenCalled()
  expect(owner.result.current.annotations.grabToast?.payload).toEqual(payload)
  expect(api.awaitGrabSelection).toHaveBeenCalledOnce()
})
it('captures the hovered rectangle and requires the image clipboard acknowledgment', async () => {
  const owner = mount()
  await start(owner)
  await expect(command('screenshot')).resolves.toMatchObject({
    copied: true,
    source: 'hover',
    state: 'awaiting'
  })
  expect(api.captureSelectionScreenshot).toHaveBeenCalledWith({
    browserPageId: 'p1',
    rect: payload.target.rectViewport
  })
  expect(api.writeVerifiedClipboardImage).toHaveBeenCalledWith(screenshot.dataUrl)
  expect(api.writeClipboardImage).not.toHaveBeenCalled()
  expect(api.awaitGrabSelection).toHaveBeenCalledOnce()
})
it.each([undefined, { written: false }])(
  'rejects an unverified image clipboard response %j without success feedback',
  async (ack) => {
    const owner = mount()
    await start(owner)
    api.writeVerifiedClipboardImage.mockResolvedValueOnce(ack)
    await expect(command('screenshot')).rejects.toThrow(
      'browser_grab_action_copy_failed_effect_unknown'
    )
    expect(owner.result.current.annotations.grabToast).toBeNull()
    expect(owner.result.current.grab.state).toBe('awaiting')
  }
)
it('waits for text write completion before observing clipboard contents', async () => {
  const owner = mount()
  await start(owner)
  let finishWrite: (() => void) | undefined
  api.writeClipboardText.mockImplementationOnce(
    (text: string) =>
      new Promise<void>((resolve) => {
        finishWrite = () => {
          clipboard = text
          resolve()
        }
      })
  )
  let response: ReturnType<typeof requestBrowserGrabAction> | undefined
  await act(async () => {
    response = requestBrowserGrabAction('p1', 'copy', Date.now() + 5000)
  })
  expect(api.readClipboardText).not.toHaveBeenCalled()
  expect(owner.result.current.annotations.grabToast).toBeNull()
  await act(async () => {
    if (!finishWrite) {
      throw new Error('write not pending')
    }
    finishWrite()
  })
  await expect(response).resolves.toMatchObject({ copied: true, source: 'hover' })
})
it('rejects stale hover extraction after cancellation before writing clipboard or feedback', async () => {
  const owner = mount()
  await start(owner)
  let completeHover: ((value: { ok: true; payload: typeof payload }) => void) | undefined
  api.extractHoverPayload.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        completeHover = resolve
      })
  )
  let response: ReturnType<typeof requestBrowserGrabAction> | undefined
  await act(async () => {
    response = requestBrowserGrabAction('p1', 'copy', Date.now() + 5000)
    void response.catch(() => {})
  })
  await expect(command('copy')).rejects.toThrow('browser_grab_action_busy')
  await act(async () => {
    await owner.result.current.grab.cancel()
    if (!completeHover) {
      throw new Error('hover not pending')
    }
    completeHover({ ok: true, payload })
  })
  await expect(response).rejects.toThrow('browser_grab_action_copy_failed_effect_unknown')
  expect(api.writeClipboardText).not.toHaveBeenCalled()
  expect(owner.result.current.annotations.grabToast).toBeNull()
})
it('uses only the active owner and rejects duplicate owners before extraction', async () => {
  mount(false)
  const active = mount()
  await start(active)
  await expect(command('copy')).resolves.toMatchObject({ copied: true })
  const second = mount()
  await start(second)
  api.extractHoverPayload.mockClear()
  await expect(command('copy')).rejects.toThrow('browser_grab_action_owner_ambiguous')
  expect(api.extractHoverPayload).not.toHaveBeenCalled()
})
it('refuses idle, markup, inactive, foreign and expired requests before extraction', async () => {
  const owner = mount()
  await expect(command('copy')).rejects.toThrow('browser_grab_action_not_ready')
  await start(owner)
  owner.rerender({ active: true, markup: true })
  await expect(command('copy')).rejects.toThrow('browser_grab_action_blocked')
  owner.rerender({ active: false, markup: false })
  await expect(command('copy')).rejects.toThrow('browser_grab_action_viewer_inactive')
  await expect(requestBrowserGrabAction('other', 'copy', Date.now() + 5000)).rejects.toThrow(
    'browser_grab_action_ui_unavailable'
  )
  await expect(requestBrowserGrabAction('p1', 'copy', 0)).rejects.toThrow('request_expired')
  expect(api.extractHoverPayload).not.toHaveBeenCalled()
})
it('copies the context-selected payload and reports committed rearm without hover extraction', async () => {
  let select: ((result: BrowserGrabResult) => void) | undefined
  api.awaitGrabSelection.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        select = resolve
      })
  )
  const owner = mount()
  await start(owner)
  await act(async () => {
    if (!select) {
      throw new Error('selection not awaiting')
    }
    select({ kind: 'context-selected', opId: 'fixture', payload })
  })
  await waitFor(() => expect(owner.result.current.grab.state).toBe('confirming'))
  await expect(command('copy')).resolves.toMatchObject({
    copied: true,
    source: 'selection',
    hasSelection: false
  })
  expect(api.extractHoverPayload).not.toHaveBeenCalled()
  expect(api.awaitGrabSelection).toHaveBeenCalledTimes(2)
})

it('preserves the original void UI action while refusing an unassigned document owner', async () => {
  const owner = mount(true, false, false)
  await start(owner)
  await expect(command('copy')).rejects.toThrow('browser_grab_action_ui_unavailable')
  await act(async () => {
    expect(owner.result.current.annotations.handleGrabActionShortcut('c')).toBeUndefined()
  })
  await waitFor(() => expect(api.writeClipboardText).toHaveBeenCalledOnce())
  expect(api.readClipboardText).not.toHaveBeenCalled()
})
it('rejects failed hover screenshots and mismatched text readback without feedback', async () => {
  const owner = mount()
  await start(owner)
  api.captureSelectionScreenshot.mockResolvedValueOnce({ ok: false, reason: 'fixture' })
  await expect(command('screenshot')).rejects.toThrow(
    'browser_grab_action_copy_failed_effect_unknown'
  )
  expect(api.writeVerifiedClipboardImage).not.toHaveBeenCalled()
  api.readClipboardText.mockResolvedValueOnce('different clipboard')
  await expect(command('copy')).rejects.toThrow('browser_grab_action_copy_failed_effect_unknown')
  expect(owner.result.current.annotations.grabToast).toBeNull()
})
it('rejects owner disposal during image writing and suppresses late success feedback', async () => {
  const owner = mount()
  await start(owner)
  let acknowledge: ((value: { written: true }) => void) | undefined
  api.writeVerifiedClipboardImage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve
      })
  )
  let response: ReturnType<typeof requestBrowserGrabAction> | undefined
  await act(async () => {
    response = requestBrowserGrabAction('p1', 'screenshot', Date.now() + 5000)
    void response.catch(() => {})
  })
  owner.unmount()
  await expect(response).rejects.toThrow('browser_grab_action_ui_unavailable_effect_unknown')
  await act(async () => {
    if (!acknowledge) {
      throw new Error('image write not pending')
    }
    acknowledge({ written: true })
  })
  expect(owner.result.current.annotations.grabToast).toBeNull()
})
