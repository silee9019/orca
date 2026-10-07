import { BrowserGuestAnnotateOverlays } from './browser-guest-annotate-overlays'
import { makeBrowserGuestOverlayFixture } from './browser-guest-overlay-test-fixture'
import { requestBrowserMarkupEditor } from '@/runtime/browser-markup-editor-request'
// @vitest-environment happy-dom
import { act, cleanup, renderHook, render, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useMarkupMode } from './useMarkupMode'
import { deliverMarkupToClipboardVerified } from './markup-clipboard-delivery'
const fixture = vi.hoisted(() => ({
  capture: vi.fn(),
  compose: vi.fn(),
  write: vi.fn(),
  success: vi.fn()
}))
vi.mock('./markup-base-image', () => ({ captureMarkupBaseImage: fixture.capture }))
vi.mock(import('./markup-screenshot-compose'), async (importOriginal) => ({
  ...(await importOriginal()),
  composeMarkupDataUrl: fixture.compose
}))
vi.mock(import('@/i18n/i18n'), async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('./browser-page-annotation-tray', () => ({ BrowserPageAnnotationTray: () => null }))
vi.mock('./pending-browser-annotation-card', () => ({ PendingBrowserAnnotationCard: () => null }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: fixture.success } }))
beforeEach(() => {
  vi.clearAllMocks()
  fixture.capture.mockResolvedValue({ dataUrl: 'captured', width: 100, height: 80 })
  fixture.compose.mockResolvedValue({
    dataUrl: 'data:image/png;base64,fixture',
    width: 100,
    height: 80
  })
  fixture.write.mockResolvedValue({ written: true })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { writeVerifiedClipboardImage: fixture.write } }
  })
})
afterEach(cleanup)
function mount() {
  return renderHook(() =>
    useMarkupMode({
      getCaptureContext: () => ({
        source: { kind: 'image', element: new Image() },
        cssWidth: 100,
        cssHeight: 80,
        outputScale: 1
      }),
      onDeliver: vi.fn(),
      onDeliverVerified: deliverMarkupToClipboardVerified
    })
  )
}
it('composes original capture context and resets only after explicit clipboard acknowledgment', async () => {
  const owner = mount()
  await act(async () => owner.result.current.start())
  let copied = false
  await act(async () => {
    copied =
      (await owner.result.current.completeVerified?.(
        { imageElement: new Image(), shapes: [] },
        () => true
      )) ?? false
  })
  expect(copied).toBe(true)
  expect(fixture.compose).toHaveBeenCalledWith(
    expect.objectContaining({
      displayCssWidth: 100,
      displayCssHeight: 80,
      outputScale: 1,
      shapes: []
    })
  )
  expect(fixture.write).toHaveBeenCalledWith('data:image/png;base64,fixture')
  expect(owner.result.current.state).toBe('idle')
  expect(fixture.success).toHaveBeenCalledOnce()
})
it.each([{ written: false }, undefined])(
  'retains drawing without feedback after refused or legacy acknowledgment %j',
  async (acknowledgment) => {
    const owner = mount()
    await act(async () => owner.result.current.start())
    fixture.write.mockResolvedValueOnce(acknowledgment)
    let copied = true
    await act(async () => {
      copied =
        (await owner.result.current.completeVerified?.(
          { imageElement: new Image(), shapes: [] },
          () => true
        )) ?? false
    })
    expect(copied).toBe(false)
    expect(owner.result.current.state).toBe('drawing')
    expect(fixture.success).not.toHaveBeenCalled()
  }
)
it('refuses an expired command before composition and preserves the existing drawing', async () => {
  const owner = mount()
  await act(async () => owner.result.current.start())
  let copied = true
  await act(async () => {
    copied =
      (await owner.result.current.completeVerified?.(
        { imageElement: new Image(), shapes: [] },
        () => false
      )) ?? false
  })
  expect(copied).toBe(false)
  expect(fixture.compose).not.toHaveBeenCalled()
  expect(fixture.write).not.toHaveBeenCalled()
  expect(owner.result.current.state).toBe('drawing')
})

it('routes the actual overlay copy owner through composition, acknowledgment and unmount', async () => {
  const target = document.createElement('div')
  document.body.append(target)
  const props = makeBrowserGuestOverlayFixture(target)
  function Owner() {
    const mode = useMarkupMode({
      getCaptureContext: () => ({
        source: { kind: 'image', element: new Image() },
        cssWidth: 100,
        cssHeight: 80,
        outputScale: 1
      }),
      onDeliver: vi.fn(),
      onDeliverVerified: deliverMarkupToClipboardVerified
    })
    return (
      <>
        <button onClick={() => void mode.start()}>Start</button>
        {mode.baseImage && (
          <BrowserGuestAnnotateOverlays
            {...props}
            markup={{ ...mode, commandOwner: { page: 'p1', active: true } }}
          />
        )}
      </>
    )
  }
  const view = render(<Owner />)
  await act(async () => fireEvent.click(view.getByText('Start')))
  const image = target.querySelector('img')
  if (!image) {
    throw new Error('missing captured image')
  }
  await expect(
    requestBrowserMarkupEditor('p1', { action: 'copy' }, Date.now() + 5000)
  ).rejects.toThrow('browser_markup_copy_effect_unknown')
  expect(fixture.write).not.toHaveBeenCalled()
  fireEvent.load(image)
  let toolResponse: Promise<unknown> | undefined
  await act(async () => {
    toolResponse = requestBrowserMarkupEditor(
      'p1',
      { action: 'tool', value: 'rect' },
      Date.now() + 5000
    )
  })
  await expect(toolResponse).resolves.toMatchObject({ tool: 'rect' })
  let response: Promise<unknown> | undefined
  await act(async () => {
    response = requestBrowserMarkupEditor('p1', { action: 'copy' }, Date.now() + 5000)
    await response
  })
  await expect(response).resolves.toMatchObject({ copied: true })
  expect(target.querySelector('[data-orca-markup-overlay]')).toBeNull()
  expect(fixture.write).toHaveBeenCalledOnce()
  target.remove()
})

it('suppresses success and stale reset when cancellation races an in-flight clipboard write', async () => {
  const owner = mount()
  await act(async () => owner.result.current.start())
  let acknowledge: (value: { written: true }) => void = () => {
    throw new Error('write not started')
  }
  fixture.write.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve
      })
  )
  let completion: Promise<boolean> | undefined
  await act(async () => {
    completion = owner.result.current.completeVerified?.(
      { imageElement: new Image(), shapes: [] },
      () => true
    )
  })
  await vi.waitFor(() => expect(fixture.write).toHaveBeenCalledOnce())
  await act(async () => {
    owner.result.current.cancel()
    acknowledge({ written: true })
    await completion
  })
  await expect(completion).resolves.toBe(false)
  expect(owner.result.current.state).toBe('idle')
  expect(fixture.success).not.toHaveBeenCalled()
})
