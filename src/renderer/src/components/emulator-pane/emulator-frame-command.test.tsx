// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmulatorDeviceFrame } from './emulator-device-frame'
import { dispatchEmulatorFrameCommand } from './emulator-frame-command'
import type {
  EmulatorFrameAction,
  EmulatorFrameState
} from '../../../../shared/emulator-frame-command'
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
async function run(container: HTMLElement, action: EmulatorFrameAction) {
  let pending: Promise<EmulatorFrameState> | undefined
  act(() => {
    pending = dispatchEmulatorFrameCommand(container, action)
  })
  if (!pending) {
    throw new Error('Missing command')
  }
  return pending
}

const control = vi.hoisted(() => ({
  sendTouch: vi.fn((_point: unknown) => true),
  sendKeyboardFrames: vi.fn(() => true),
  cancelKeyboardFrames: vi.fn(),
  onStreamSize: (_size: { width: number; height: number }) => {}
}))
vi.mock('./use-emulator-control-stream', () => ({
  useEmulatorControlStream: () => ({
    sendTouch: control.sendTouch,
    sendKeyboardFrames: control.sendKeyboardFrames,
    cancelKeyboardFrames: control.cancelKeyboardFrames
  })
}))
vi.mock('./use-emulator-stream-window-visibility', () => ({
  useEmulatorStreamWindowVisible: () => true
}))
vi.mock('./emulator-screen-stream-content', () => ({
  EmulatorScreenStreamContent: ({
    streamError,
    onStreamSize
  }: {
    streamError: boolean
    onStreamSize: (size: { width: number; height: number }) => void
  }) => {
    control.onStreamSize = onStreamSize
    return <span>{streamError ? 'stream-error' : 'stream-ok'}</span>
  }
}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('existing emulator frame owner commands', () => {
  it.each([-10, 1])(
    'rejects outside or letterbox start x=%s before focus, capture or touch',
    async (clientX) => {
      const container = document.createElement('div')
      document.body.append(container)
      const root = createRoot(container)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 0, 100, 200)
      )
      const capture = vi.fn()
      Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
        configurable: true,
        value: capture
      })
      try {
        await act(async () =>
          root.render(
            <EmulatorDeviceFrame
              loading={false}
              isLive
              isActive
              visualOrientation="portrait"
              onTap={vi.fn()}
              onGesture={vi.fn()}
            />
          )
        )
        act(() => control.onStreamSize({ width: 90, height: 190 }))
        const screen = container.querySelector('[data-emulator-screen]')
        await expect(
          run(container, {
            type: 'pointer',
            points: [
              { type: 'down', clientX, clientY: 80 },
              { type: 'up', clientX, clientY: 80 }
            ]
          })
        ).rejects.toThrow('pointer_not_handled')
        expect(control.sendTouch).not.toHaveBeenCalled()
        expect(capture).not.toHaveBeenCalled()
        expect(document.activeElement).not.toBe(screen)
        expect(screen?.getAttribute('aria-keyshortcuts')).toBeNull()
      } finally {
        await act(async () => root.unmount())
        container.remove()
        Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture')
      }
    }
  )
  it('runs pointer capture and cancel through the actual screen handlers without leaving held touch', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 100, 200)
    )
    const capture = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: capture
    })
    try {
      await act(async () =>
        root.render(
          <EmulatorDeviceFrame
            loading={false}
            isLive
            isActive
            visualOrientation="portrait"
            onTap={vi.fn()}
            onGesture={vi.fn()}
          />
        )
      )
      const state = await run(container, {
        type: 'pointer',
        points: [
          { type: 'down', clientX: 50, clientY: 80 },
          { type: 'move', clientX: 60, clientY: 100 },
          { type: 'cancel', clientX: 60, clientY: 100 }
        ]
      })
      expect(state.keyboardCaptureActive).toBe(true)
      expect(document.activeElement).toBe(container.querySelector('[data-emulator-screen]'))
      expect(capture).toHaveBeenCalledTimes(1)
      expect(control.sendTouch.mock.calls.map((call) => call[0])).toEqual([
        expect.objectContaining({ type: 'begin' }),
        expect.objectContaining({ type: 'move' }),
        expect.objectContaining({ type: 'end' })
      ])
      control.sendTouch.mockClear()
      const screen = container.querySelector<HTMLDivElement>('[data-emulator-screen]')
      if (!screen) {
        throw new Error('Missing screen')
      }
      act(() => {
        screen.dispatchEvent(
          new PointerEvent('pointerdown', {
            pointerId: 7,
            button: 0,
            clientX: 30,
            clientY: 40,
            bubbles: true,
            cancelable: true
          })
        )
      })
      await expect(
        run(container, {
          type: 'pointer',
          points: [
            { type: 'down', clientX: 50, clientY: 80 },
            { type: 'up', clientX: 50, clientY: 80 }
          ]
        })
      ).rejects.toThrow('pointer_not_handled')
      expect(control.sendTouch).toHaveBeenCalledTimes(1)
      act(() => {
        screen.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7, bubbles: true }))
      })
      expect(control.sendTouch).toHaveBeenCalledTimes(2)
      await act(async () => root.unmount())
      expect(control.sendTouch).toHaveBeenCalledTimes(2)
    } finally {
      container.remove()
      Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture')
    }
  })
  it('runs the existing wheel input and idle-release lifecycle', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 100, 200)
    )
    try {
      await act(async () =>
        root.render(
          <EmulatorDeviceFrame
            loading={false}
            isLive
            isActive
            visualOrientation="portrait"
            onTap={vi.fn()}
            onGesture={vi.fn()}
          />
        )
      )
      await run(container, {
        type: 'wheel',
        clientX: 50,
        clientY: 100,
        deltaX: 0,
        deltaY: 10,
        deltaMode: 0
      })
      expect(control.sendTouch.mock.calls.map((call) => call[0])).toEqual([
        expect.objectContaining({ type: 'begin' }),
        expect.objectContaining({ type: 'move' }),
        expect.objectContaining({ type: 'end' })
      ])
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
  it('uses existing key capture and paste batching, and Escape cancels without a device Escape', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () =>
        root.render(
          <EmulatorDeviceFrame
            loading={false}
            isLive
            isActive
            visualOrientation="portrait"
            onTap={vi.fn()}
            onGesture={vi.fn()}
          />
        )
      )
      await expect(run(container, { type: 'key', key: 'a', shift: false })).rejects.toThrow(
        'emulator_key_not_handled'
      )
      await run(container, { type: 'key', key: 'Enter', shift: false })
      expect(control.sendKeyboardFrames).not.toHaveBeenCalled()
      await run(container, { type: 'paste', text: 'a'.repeat(30) })
      expect(control.sendKeyboardFrames.mock.calls.length).toBeGreaterThan(1)
      control.sendKeyboardFrames.mockClear()
      await run(container, { type: 'key', key: 'Escape', shift: false })
      expect(control.sendKeyboardFrames).not.toHaveBeenCalled()
      expect(control.cancelKeyboardFrames).toHaveBeenCalled()
      await expect(run(container, { type: 'paste', text: 'a' })).rejects.toThrow(
        'emulator_paste_rejected'
      )
      await run(container, { type: 'key', key: 'Enter', shift: false })
      await expect(run(container, { type: 'paste', text: '가'.repeat(2000) })).rejects.toThrow(
        'emulator_paste_rejected'
      )
      const paste = run(container, { type: 'paste', text: 'a'.repeat(500) })
      const cancelled = expect(paste).rejects.toThrow('emulator_paste_cancelled')
      await run(container, { type: 'key', key: 'Escape', shift: false })
      await cancelled
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
  it('rejects a missing owner without changing another frame', async () => {
    await expect(
      dispatchEmulatorFrameCommand(document.createElement('div'), {
        type: 'wheel',
        clientX: 50,
        clientY: 100,
        deltaX: 0,
        deltaY: 10,
        deltaMode: 0
      })
    ).rejects.toThrow('emulator_frame_unavailable')
  })
})
