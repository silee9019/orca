// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { requestBrowserMarkupEditor } from '@/runtime/browser-markup-editor-request'
import type {
  BrowserMarkupEditorCommand,
  BrowserMarkupEditorState
} from '../../../../../shared/rpc-contract/browser-markup-editor-params'
import { MarkupOverlay, type MarkupOverlayProps } from './MarkupOverlay'
vi.mock(import('@/i18n/i18n'), async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (_key: string, fallback: string) => fallback
}))
afterEach(cleanup)
const first = { x: 0.1, y: 0.2 }
const points = [
  { x: 0.1, y: 0.2 },
  { x: 0.4, y: 0.5 },
  { x: 0.8, y: 0.7 }
]
function mount() {
  const complete = vi.fn<MarkupOverlayProps['onComplete']>()
  const props: MarkupOverlayProps = {
    baseImage: { dataUrl: 'data:image/png;base64,fixture', width: 200, height: 100 },
    commandOwner: { page: 'page', active: true },
    busy: false,
    onComplete: complete,
    onCancel: vi.fn()
  }
  const view = render(<MarkupOverlay {...props} />)
  const canvas = view.container.querySelector('canvas')
  const image = view.container.querySelector('img')
  if (!canvas || !image) {
    throw new Error('missing actual markup owner elements')
  }
  const bounds = vi
    .spyOn(canvas, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(10, 20, 200, 100))
  Object.defineProperty(canvas, 'setPointerCapture', { configurable: true, value: vi.fn() })
  fireEvent.load(image)
  const done = () => {
    fireEvent.click(view.getByRole('button', { name: 'Copy Markup' }))
    return complete.mock.calls.at(-1)?.[0].shapes
  }
  return { ...view, canvas, bounds, done, props }
}
async function command(command: BrowserMarkupEditorCommand) {
  let response: Promise<BrowserMarkupEditorState> | undefined
  await act(async () => {
    response = requestBrowserMarkupEditor('page', command, Date.now() + 5000)
    void response.catch(() => {})
  })
  if (!response) {
    throw new Error('missing gesture response')
  }
  return response
}
it.each(['pen', 'highlight', 'arrow', 'rect', 'ellipse'] as const)(
  'creates %s geometry through the actual overlay and original pointer transition owner',
  async (tool) => {
    const view = mount()
    await command({ action: 'tool', value: tool })
    expect(await command({ action: 'gesture', points, cancel: false })).toMatchObject({
      shapeCount: 1,
      gestureActive: false,
      canUndo: true
    })
    const geometry =
      tool === 'pen' || tool === 'highlight'
        ? {
            points: [
              { x: 20, y: 20 },
              { x: 80, y: 50 },
              { x: 160, y: 70 }
            ]
          }
        : { from: { x: 20, y: 20 }, to: { x: 160, y: 70 } }
    expect(view.done()).toMatchObject([{ kind: tool, width: 4, ...geometry }])
    expect(await command({ action: 'undo' })).toMatchObject({ shapeCount: 0 })
    expect(await command({ action: 'redo' })).toMatchObject({ shapeCount: 1 })
  }
)
it('preserves original pointer-created geometry after sharing the begin owner', async () => {
  const view = mount()
  await command({ action: 'tool', value: 'rect' })
  fireEvent.pointerDown(view.canvas, { button: 0, pointerId: 4, clientX: 30, clientY: 40 })
  fireEvent.pointerMove(view.canvas, { pointerId: 4, clientX: 170, clientY: 90 })
  fireEvent.pointerUp(view.canvas, { pointerId: 4 })
  expect(view.done()).toMatchObject([
    { kind: 'rect', from: { x: 20, y: 20 }, to: { x: 160, y: 70 } }
  ])
})
it('cancels drawing without history and preserves original zero-area shape behavior', async () => {
  mount()
  await command({ action: 'tool', value: 'rect' })
  expect(await command({ action: 'gesture', points, cancel: true })).toMatchObject({
    shapeCount: 0,
    canUndo: false,
    gestureActive: false
  })
  expect(
    await command({ action: 'gesture', points: [{ x: 0.5, y: 0.5 }], cancel: false })
  ).toMatchObject({ shapeCount: 0, canUndo: false })
})
it('uses the original eraser hit test and restores the erased shape with undo', async () => {
  mount()
  await command({ action: 'tool', value: 'rect' })
  await command({ action: 'gesture', points, cancel: false })
  await command({ action: 'tool', value: 'eraser' })
  expect(await command({ action: 'gesture', points: [first], cancel: false })).toMatchObject({
    shapeCount: 0,
    canUndo: true
  })
  expect(await command({ action: 'undo' })).toMatchObject({ shapeCount: 1 })
})
it('places pending text at normalized canvas coordinates and reuses text commit', async () => {
  const view = mount()
  await command({ action: 'tool', value: 'text' })
  expect(await command({ action: 'gesture', points: [first], cancel: false })).toMatchObject({
    pendingText: true,
    shapeCount: 0
  })
  await expect(command({ action: 'gesture', points, cancel: false })).rejects.toThrow(
    'browser_markup_gesture_unavailable'
  )
  await command({ action: 'text-commit', text: '  placed  ' })
  expect(view.done()).toMatchObject([{ kind: 'text', at: { x: 20, y: 20 }, text: 'placed' }])
})
it('refuses invalid geometry, unavailable canvas and active physical gestures without mutating shapes', async () => {
  const view = mount()
  await expect(
    command({ action: 'gesture', points: [{ x: 2, y: 0 }], cancel: false })
  ).rejects.toThrow('browser_markup_gesture_unavailable')
  view.bounds.mockReturnValue(new DOMRect())
  await expect(command({ action: 'gesture', points, cancel: false })).rejects.toThrow(
    'browser_markup_gesture_unavailable'
  )
  view.bounds.mockReturnValue(new DOMRect(10, 20, 200, 100))
  fireEvent.pointerDown(view.canvas, { button: 0, pointerId: 4, clientX: 30, clientY: 40 })
  await expect(command({ action: 'gesture', points, cancel: false })).rejects.toThrow(
    'browser_markup_gesture_unavailable'
  )
  fireEvent.pointerCancel(view.canvas, { pointerId: 4 })
  expect(await command({ action: 'status' })).toMatchObject({ shapeCount: 0, gestureActive: false })
})

it('refuses inactive, composing and expired gesture requests before changing the document', async () => {
  const view = mount()
  view.rerender(<MarkupOverlay {...view.props} commandOwner={{ page: 'page', active: false }} />)
  await expect(command({ action: 'gesture', points, cancel: false })).rejects.toThrow(
    'browser_markup_viewer_inactive'
  )
  view.rerender(<MarkupOverlay {...view.props} busy />)
  await expect(command({ action: 'gesture', points, cancel: false })).rejects.toThrow(
    'browser_markup_composing'
  )
  await expect(
    requestBrowserMarkupEditor('page', { action: 'gesture', points, cancel: false }, Date.now() - 1)
  ).rejects.toThrow('request_expired')
})
