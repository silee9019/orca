import { requestBrowserAnnotationDraft } from '@/runtime/browser-annotation-draft-request'
// @vitest-environment happy-dom
import { requestBrowserGrab, type BrowserGrabState } from '@/runtime/browser-grab-request'
import { useLayoutEffect } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from '@/store/slices/browser-slice-test-harness'
import { makeAnnotation } from '@/store/slices/browser-annotation-test-fixture'
import type {
  BrowserGrabResult,
  BrowserCaptureSelectionScreenshotResult
} from '../../../../../shared/browser-grab-types'
import { useGrabMode } from './useGrabMode'
import { useBrowserPageGrabAnnotations } from './use-browser-page-grab-annotations'

const state = vi.hoisted((): { store?: ReturnType<typeof createTestStore> } => ({}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (value: ReturnType<ReturnType<typeof createTestStore>['getState']>) => unknown) => {
      if (!state.store) {
        throw new Error('Missing test store')
      }
      return state.store(selector)
    },
    {
      getState: () => {
        if (!state.store) {
          throw new Error('Missing store')
        }
        return state.store.getState()
      }
    }
  )
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

beforeEach(() => {
  state.store = createTestStore()
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'api')
})

function mount(invalidateBeforePendingEffect = false, isActive = false) {
  const selection = deferred<BrowserGrabResult>()
  const screenshot = deferred<BrowserCaptureSelectionScreenshotResult>()
  const awaitGrabSelection = vi
    .fn()
    .mockReturnValueOnce(selection.promise)
    .mockReturnValue(new Promise(() => {}))
  const captureSelectionScreenshot = vi.fn().mockReturnValue(screenshot.promise)
  const cancelGrab = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      browser: {
        setGrabMode: vi.fn().mockResolvedValue({ ok: true }),
        awaitGrabSelection,
        captureSelectionScreenshot,
        cancelGrab
      }
    }
  })
  const containerRef = { current: null }
  const webviewRef = { current: null }
  const setBrowserOverlayViewport = vi.fn()
  const setBrowserAnnotationTrayOpen = vi.fn()
  const hook = renderHook(() => {
    const grab = useGrabMode('page-1')
    const annotations = useBrowserPageGrabAnnotations({
      browserTabId: 'page-1',
      isActive,
      grab,
      containerRef,
      webviewRef,
      setBrowserOverlayViewport,
      setBrowserAnnotationTrayOpen,
      browserAnnotationsLength: 0
    })
    const { cancelPendingBrowserCapture } = annotations
    useLayoutEffect(() => {
      if (invalidateBeforePendingEffect && grab.state === 'confirming') {
        cancelPendingBrowserCapture()
      }
    }, [grab.state, cancelPendingBrowserCapture])
    return { grab, annotations }
  })
  return {
    ...hook,
    selection,
    screenshot,
    awaitGrabSelection,
    captureSelectionScreenshot,
    cancelGrab
  }
}

function selected(): BrowserGrabResult {
  return { opId: 'fixture-op', kind: 'selected', payload: makeAnnotation('page-1').payload }
}

describe('capture cancellation on a document boundary', () => {
  it('does not restore pending capture when loading cancels between commit and passive effects', async () => {
    const h = mount(true)
    act(() => h.result.current.annotations.startGrabIntent('annotate'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledOnce())
    await act(async () => {
      h.selection.resolve(selected())
      h.screenshot.resolve({ ok: false, reason: 'fixture' })
      await h.screenshot.promise
    })
    expect(h.result.current.grab.state).toBe('idle')
    expect(h.result.current.annotations.pendingAnnotationPayload).toBeNull()
    act(() => h.result.current.annotations.handleAddBrowserAnnotation('Canceled capture', 'fix'))
    expect(state.store?.getState().browserAnnotationsByPageId['page-1']).toBeUndefined()
    expect(state.store?.getState().browserAnnotationMarkerIdsByPageId['page-1']).toBeUndefined()
  })

  it('ignores a same-page selection that completes after document invalidation', async () => {
    const h = mount()
    act(() => h.result.current.annotations.startGrabIntent('annotate'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledOnce())
    act(() => h.result.current.annotations.cancelPendingBrowserCapture())
    await act(async () => {
      h.selection.resolve(selected())
      await h.selection.promise
    })
    expect(h.cancelGrab).toHaveBeenCalledWith({ browserPageId: 'page-1' })
    expect(h.captureSelectionScreenshot).not.toHaveBeenCalled()
    expect(h.result.current.grab.state).toBe('idle')
    expect(h.result.current.annotations.pendingAnnotationPayload).toBeNull()
    expect(state.store?.getState().browserAnnotationsByPageId['page-1']).toBeUndefined()
  })

  it('ignores a same-URL screenshot that finishes after cancellation without creating eligible geometry', async () => {
    const h = mount()
    act(() => h.result.current.annotations.startGrabIntent('annotate'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledOnce())
    await act(async () => {
      h.selection.resolve(selected())
      await h.selection.promise
    })
    expect(h.captureSelectionScreenshot).toHaveBeenCalledOnce()
    act(() => h.result.current.annotations.cancelPendingBrowserCapture())
    await act(async () => {
      h.screenshot.resolve({ ok: false, reason: 'fixture' })
      await h.screenshot.promise
    })
    expect(h.result.current.grab.state).toBe('idle')
    expect(h.result.current.annotations.pendingAnnotationPayload).toBeNull()
    expect(state.store?.getState().browserAnnotationMarkerIdsByPageId['page-1']).toBeUndefined()
  })

  it('blocks an already-rendered Add callback after invalidation and permits a fresh capture', async () => {
    const h = mount()
    act(() => h.result.current.annotations.startGrabIntent('annotate'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledOnce())
    await act(async () => {
      h.selection.resolve(selected())
      h.screenshot.resolve({ ok: false, reason: 'fixture' })
      await h.screenshot.promise
    })
    await waitFor(() =>
      expect(h.result.current.annotations.pendingAnnotationPayload).not.toBeNull()
    )
    const oldAdd = h.result.current.annotations.handleAddBrowserAnnotation
    act(() => {
      h.result.current.annotations.cancelPendingBrowserCapture()
      oldAdd('Stale note', 'fix')
    })
    expect(state.store?.getState().browserAnnotationsByPageId['page-1']).toBeUndefined()

    const fresh = deferred<BrowserGrabResult>()
    h.awaitGrabSelection.mockReturnValueOnce(fresh.promise)
    act(() => h.result.current.annotations.startGrabIntent('annotate'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledTimes(2))
    await act(async () => {
      fresh.resolve(selected())
      await fresh.promise
    })
    await waitFor(() =>
      expect(h.result.current.annotations.pendingAnnotationPayload).not.toBeNull()
    )
    act(() => h.result.current.annotations.handleAddBrowserAnnotation('Fresh note', 'change'))
    const saved = state.store?.getState().browserAnnotationsByPageId['page-1']
    expect(saved).toHaveLength(1)
    expect(saved?.[0].comment).toBe('Fresh note')
    expect(state.store?.getState().browserAnnotationMarkerIdsByPageId['page-1']).toEqual([
      saved?.[0].id
    ])
  })
})

it.each(['copy', 'annotate'] as const)(
  'uses the existing intent owner for explicit %s picker starts',
  async (intent) => {
    const h = mount(false, true)
    const clipboard = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window.api, 'ui', {
      value: { writeClipboardText: clipboard },
      configurable: true
    })
    let started: Promise<BrowserGrabState> | undefined
    await act(async () => {
      started = requestBrowserGrab('page-1', 'intent-start', Date.now() + 9000, intent).then(() =>
        requestBrowserGrab('page-1', 'await-ready', Date.now() + 9000)
      )
      void started.catch(() => {})
    })
    expect(await started).toMatchObject({ state: 'awaiting' })
    expect(h.result.current.annotations.grabIntent).toBe(intent)
    await act(async () => {
      h.selection.resolve(selected())
      h.screenshot.resolve({ ok: false, reason: 'fixture' })
    })
    await waitFor(() => expect(h.result.current.grab.state).toBe('confirming'))
    if (intent === 'annotate') {
      expect(h.result.current.annotations.pendingAnnotationPayload).not.toBeNull()
      expect(clipboard).not.toHaveBeenCalled()
    } else {
      expect(h.result.current.annotations.pendingAnnotationPayload).toBeNull()
      expect(clipboard).toHaveBeenCalledOnce()
    }
  }
)
it('refuses explicit intent starts in inactive viewers before native selection begins', async () => {
  const h = mount()
  await expect(
    requestBrowserGrab('page-1', 'intent-start', Date.now() + 9000, 'copy')
  ).rejects.toThrow('browser_grab_viewer_inactive')
  expect(h.awaitGrabSelection).not.toHaveBeenCalled()
})

it('adds the actual pending annotation through its owner and reads back the saved id', async () => {
  const h = mount(false, true)
  act(() => h.result.current.annotations.startGrabIntent('annotate'))
  await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledOnce())
  await act(async () => {
    h.selection.resolve(selected())
    h.screenshot.resolve({ ok: false, reason: 'fixture' })
    await h.screenshot.promise
  })
  await waitFor(() => expect(h.result.current.annotations.pendingAnnotationPayload).not.toBeNull())
  expect(requestBrowserAnnotationDraft('page-1', { action: 'status' }, Date.now() + 1000)).toEqual({
    hasDraft: true
  })
  let savedId: string | undefined
  act(() => {
    const result = requestBrowserAnnotationDraft(
      'page-1',
      { action: 'add', comment: 'Owned draft', intent: 'fix' },
      Date.now() + 1000
    )
    expect(result.hasDraft).toBe(false)
    savedId = result.annotationId
  })
  const notes = state.store?.getState().browserAnnotationsByPageId['page-1']
  expect(notes).toHaveLength(1)
  expect(notes?.[0]).toMatchObject({ id: savedId, comment: 'Owned draft', intent: 'fix' })
  expect(h.result.current.annotations.pendingAnnotationPayload).toBeNull()
  expect(() =>
    requestBrowserAnnotationDraft(
      'page-1',
      { action: 'add', comment: 'duplicate', intent: 'fix' },
      Date.now() + 1000
    )
  ).toThrow('browser_annotation_draft_missing')
})

it('cancels the actual draft and rejects expired, inactive and missing owners', async () => {
  const h = mount(false, true)
  const selection = selected()
  if (selection.kind !== 'selected') {
    throw new Error('Expected selected fixture')
  }
  act(() => h.result.current.annotations.setPendingAnnotationPayload(selection.payload))
  act(() => {
    expect(
      requestBrowserAnnotationDraft('page-1', { action: 'cancel' }, Date.now() + 1000)
    ).toEqual({ hasDraft: false })
  })
  expect(h.result.current.annotations.pendingAnnotationPayload).toBeNull()
  expect(() =>
    requestBrowserAnnotationDraft('page-1', { action: 'status' }, Date.now() - 1)
  ).toThrow('request_expired')
  expect(() =>
    requestBrowserAnnotationDraft('other', { action: 'status' }, Date.now() + 1000)
  ).toThrow('browser_annotation_draft_ui_unavailable')
  h.unmount()
  mount(false, false)
  expect(() =>
    requestBrowserAnnotationDraft('page-1', { action: 'cancel' }, Date.now() + 1000)
  ).toThrow('browser_annotation_viewer_inactive')
})

it.each(['copy', 'copy-screenshot'] as const)(
  'copies selected %s only after the native effect is acknowledged',
  async (action) => {
    const h = mount(false, true)
    let copiedText = ''
    let readbackMatches = false
    const textWrite = vi.fn(async (text: string) => {
      copiedText = text
    })
    const imageWrite = vi.fn().mockResolvedValue({ written: true }).mockResolvedValueOnce(undefined)
    Object.defineProperty(window.api, 'ui', {
      configurable: true,
      value: {
        writeClipboardText: textWrite,
        readClipboardText: async () => (readbackMatches ? copiedText : 'changed by fixture'),
        writeVerifiedClipboardImage: imageWrite
      }
    })
    act(() => h.result.current.annotations.startGrabIntent('copy'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledOnce())
    await act(async () => {
      h.selection.resolve({
        opId: 'fixture',
        kind: 'context-selected',
        payload: makeAnnotation('page-1').payload
      })
      h.screenshot.resolve({
        ok: true,
        screenshot: {
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,AAAA',
          width: 100,
          height: 40
        }
      })
    })
    await waitFor(() => expect(h.result.current.grab.state).toBe('confirming'))
    await expect(requestBrowserGrab('page-1', action, Date.now() + 1000)).rejects.toThrow(
      'browser_grab_copy_failed_effect_unknown'
    )
    expect(h.result.current.grab.state).toBe('confirming')
    readbackMatches = true
    textWrite.mockClear()
    imageWrite.mockClear()
    let copied: Promise<BrowserGrabState> | undefined
    await act(async () => {
      copied = requestBrowserGrab('page-1', action, Date.now() + 1000)
      void copied.catch(() => {})
    })
    expect((await copied)?.hasSelection).toBe(false)
    if (action === 'copy') {
      expect(textWrite).toHaveBeenCalledOnce()
      expect(copiedText).toContain('Submit')
      expect(imageWrite).not.toHaveBeenCalled()
    } else {
      expect(imageWrite).toHaveBeenCalledExactlyOnceWith('data:image/png;base64,AAAA')
      expect(textWrite).not.toHaveBeenCalled()
    }
    expect(h.result.current.grab.state).not.toBe('confirming')
  }
)
