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
  cancelKeyboardFrames: vi.fn()
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
  EmulatorScreenStreamContent: ({ streamError }: { streamError: boolean }) => (
    <span>{streamError ? 'stream-error' : 'stream-ok'}</span>
  )
}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('existing emulator frame owner commands', () => {
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
