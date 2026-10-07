// @vitest-environment happy-dom
import { act, cleanup, renderHook, render, fireEvent } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { requestBrowserMarkupEditor } from '@/runtime/browser-markup-editor-request'
import type {
  BrowserMarkupEditorCommand,
  BrowserMarkupEditorState
} from '../../../../../shared/rpc-contract/browser-markup-editor-params'
import { useMarkupEditor } from './useMarkupEditor'
import { useBrowserMarkupEditorCommands } from './use-browser-markup-editor-commands'
afterEach(cleanup)
function mount(active = true, busy = false) {
  return renderHook(() => {
    const editor = useMarkupEditor(busy, vi.fn())
    useBrowserMarkupEditorCommands({ page: 'p1', active }, busy, editor)
    return editor
  })
}
async function command(command: BrowserMarkupEditorCommand) {
  let response: Promise<BrowserMarkupEditorState> | undefined
  await act(async () => {
    response = requestBrowserMarkupEditor('p1', command, Date.now() + 5000)
    void response.catch(() => {})
  })
  if (!response) {
    throw new Error('missing editor request')
  }
  return response
}
it('changes original editor tools and canonical settings with committed state readback', async () => {
  const editor = mount()
  expect(await command({ action: 'tool', value: 'text' })).toMatchObject({ tool: 'text' })
  expect(await command({ action: 'color', value: '#3b82f6' })).toMatchObject({ color: '#3b82f6' })
  expect(await command({ action: 'width', value: 8 })).toMatchObject({ width: 8 })
  expect(await command({ action: 'font-size', value: 32 })).toMatchObject({ fontSize: 32 })
  expect(editor.result.current.tool).toBe('text')
  expect(await command({ action: 'status' })).toMatchObject({
    shapeCount: 0,
    canUndo: false,
    pendingText: false
  })
})
it('rejects noncanonical settings, inactive or composing owners before changing editor state', async () => {
  const owner = mount()
  await expect(command({ action: 'color', value: '#123456' })).rejects.toThrow(
    'invalid_markup_setting'
  )
  await expect(command({ action: 'width', value: 3 })).rejects.toThrow('invalid_markup_setting')
  expect(owner.result.current.width).toBe(4)
  owner.unmount()
  const inactive = mount(false)
  await expect(command({ action: 'tool', value: 'rect' })).rejects.toThrow(
    'browser_markup_viewer_inactive'
  )
  inactive.unmount()
  mount(true, true)
  await expect(command({ action: 'clear' })).rejects.toThrow('browser_markup_composing')
})

it('undoes, redoes and clears actual pointer-created shapes through original history', async () => {
  function CanvasOwner() {
    const editor = useMarkupEditor(false, vi.fn())
    useBrowserMarkupEditorCommands({ page: 'p1', active: true }, false, editor)
    return (
      <canvas
        data-testid="drawing"
        ref={editor.canvasRef}
        onPointerDown={editor.onPointerDown}
        onPointerMove={editor.onPointerMove}
        onPointerUp={editor.onPointerUp}
      />
    )
  }
  const view = render(<CanvasOwner />)
  const canvas = view.getByTestId('drawing')
  Object.defineProperty(canvas, 'setPointerCapture', { value: vi.fn() })
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 100, clientY: 0 })
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 100, clientY: 0 })
  expect(await command({ action: 'status' })).toMatchObject({ shapeCount: 1, canUndo: true })
  expect(await command({ action: 'undo' })).toMatchObject({ shapeCount: 0, canRedo: true })
  expect(await command({ action: 'redo' })).toMatchObject({ shapeCount: 1 })
  expect(await command({ action: 'clear' })).toMatchObject({ shapeCount: 0 })
  expect(await command({ action: 'undo' })).toMatchObject({ shapeCount: 1 })
})
