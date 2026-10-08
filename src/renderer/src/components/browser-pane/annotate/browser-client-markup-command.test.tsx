// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { requestBrowserMarkup, type BrowserMarkupState } from '@/runtime/browser-markup-request'
import { useMarkupMode } from './useMarkupMode'
import { useBrowserMarkupCommands } from './use-browser-markup-commands'
const fixture = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('./markup-base-image', () => ({ captureMarkupBaseImage: fixture.capture }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const target = {
  worktreeId: 'folder',
  page: 'p1',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'client',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
beforeEach(() => {
  fixture.capture.mockReset()
  fixture.capture.mockResolvedValue({ dataUrl: 'fixture', width: 100, height: 80 })
})
afterEach(cleanup)
function mount(isCurrent = () => true) {
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
    useBrowserMarkupCommands('p1', true, mode, { target, isCurrent })
    return mode
  })
}
async function command(action: 'start' | 'cancel' | 'status') {
  let pending: Promise<BrowserMarkupState> | undefined
  await act(async () => {
    pending = requestBrowserMarkup('p1', action, Date.now() + 5000, target)
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing request')
  }
  return pending
}
it('receipts the exact client target after existing capture and cancel effects', async () => {
  const owner = mount()
  expect(await command('start')).toEqual({ state: 'drawing', hasImage: true, clientTarget: target })
  expect(owner.result.current.baseImage).not.toBeNull()
  expect(await command('cancel')).toEqual({ state: 'idle', hasImage: false, clientTarget: target })
  expect(owner.result.current.baseImage).toBeNull()
})
it('refuses legacy and foreign generation requests before capture', async () => {
  mount()
  await expect(requestBrowserMarkup('p1', 'start', Date.now() + 5000)).rejects.toThrow(
    'browser_markup_ui_unavailable'
  )
  await expect(
    requestBrowserMarkup('p1', 'start', Date.now() + 5000, { ...target, pageHostGeneration: 5 })
  ).rejects.toThrow('browser_markup_ui_unavailable')
  expect(fixture.capture).not.toHaveBeenCalled()
})
it('rejects changed client ownership while capture is pending', async () => {
  let current = true
  let resolveCapture: (value: { dataUrl: string; width: number; height: number }) => void = () => {
    throw new Error('capture missing')
  }
  fixture.capture.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveCapture = resolve
      })
  )
  const owner = mount(() => current)
  let pending: Promise<BrowserMarkupState> | undefined
  await act(async () => {
    pending = requestBrowserMarkup('p1', 'start', Date.now() + 5000, target)
    void pending.catch(() => {})
  })
  current = false
  await act(async () => resolveCapture({ dataUrl: 'stale', width: 100, height: 80 }))
  await expect(pending).rejects.toThrow('browser_markup_owner_changed_effect_unknown')
  expect(owner.result.current.baseImage).toBeNull()
})
