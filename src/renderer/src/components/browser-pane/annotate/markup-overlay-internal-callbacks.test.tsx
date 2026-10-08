// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MarkupOverlay } from './MarkupOverlay'
import { useMarkupMode } from './useMarkupMode'

const fixture = vi.hoisted(() => ({ capture: vi.fn(), deliver: vi.fn() }))
vi.mock('./markup-base-image', () => ({ captureMarkupBaseImage: fixture.capture }))
vi.mock(import('@/i18n/i18n'), async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (_key: string, fallback: string) => fallback
}))
beforeEach(() => {
  fixture.deliver.mockClear()
  fixture.capture.mockResolvedValue({ dataUrl: 'captured', width: 100, height: 80 })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Owner({ onOuterPointerDown }: { onOuterPointerDown: () => void }) {
  const mode = useMarkupMode({
    getCaptureContext: () => ({
      source: { kind: 'image', element: new Image() },
      cssWidth: 100,
      cssHeight: 80,
      outputScale: 1
    }),
    onDeliver: fixture.deliver
  })
  return (
    <div onPointerDown={onOuterPointerDown}>
      <output aria-label="Markup mode">{mode.state}</output>
      <button onClick={() => void mode.start()}>Start</button>
      {mode.baseImage && (
        <MarkupOverlay
          baseImage={mode.baseImage}
          busy={mode.state === 'composing'}
          onComplete={mode.complete}
          onCancel={mode.cancel}
        />
      )}
    </div>
  )
}

it('cancels the actual drawing owner after base-image decode failure without delivering', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const view = render(<Owner onOuterPointerDown={vi.fn()} />)
  await act(async () => fireEvent.click(view.getByText('Start')))
  expect(view.getByLabelText('Markup mode').textContent).toBe('drawing')
  const image = view.container.querySelector('img')
  if (!image) {
    throw new Error('missing markup base image')
  }
  expect(view.getByRole('button', { name: 'Copy Markup' })).toHaveProperty('disabled', true)
  fireEvent.error(image)
  expect(error).toHaveBeenCalledExactlyOnceWith('markup: base screenshot failed to load')
  expect(fixture.deliver).not.toHaveBeenCalled()
  expect(view.getByLabelText('Markup mode').textContent).toBe('idle')
  expect(view.container.querySelector('[data-orca-markup-overlay]')).toBeNull()
})

it('keeps text-input pointer events local and commits through the actual editor', async () => {
  const outerPointerDown = vi.fn()
  const view = render(<Owner onOuterPointerDown={outerPointerDown} />)
  await act(async () => fireEvent.click(view.getByText('Start')))
  fireEvent.click(view.getByRole('button', { name: 'Text' }))
  const canvas = view.container.querySelector('canvas')
  if (!canvas) {
    throw new Error('missing markup canvas')
  }
  fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 10, clientY: 20 })
  const input = view.getByRole('textbox', { name: 'Annotation text' })
  outerPointerDown.mockClear()
  fireEvent.pointerDown(input, { pointerId: 2, button: 0, clientX: 10, clientY: 20 })
  expect(outerPointerDown).not.toHaveBeenCalled()
  expect(view.getByRole('button', { name: 'Undo' })).toHaveProperty('disabled', true)
  fireEvent.change(input, { target: { value: 'fixture annotation' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(view.queryByRole('textbox', { name: 'Annotation text' })).toBeNull()
  expect(view.getByRole('button', { name: 'Undo' })).toHaveProperty('disabled', false)
  fireEvent.click(view.getByRole('button', { name: 'Undo' }))
  expect(view.getByRole('button', { name: 'Redo' })).toHaveProperty('disabled', false)
})
