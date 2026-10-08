// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmulatorDeviceFrame } from './emulator-device-frame'
import { dispatchEmulatorFrameCommand } from './emulator-frame-command'

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
const fixture = vi.hoisted(() => ({ sendTouch: vi.fn(() => true) }))
vi.mock('./use-emulator-control-stream', () => ({
  useEmulatorControlStream: () => ({
    sendTouch: fixture.sendTouch,
    sendKeyboardFrames: vi.fn(),
    cancelKeyboardFrames: vi.fn()
  })
}))
vi.mock('./use-emulator-stream-window-visibility', () => ({
  useEmulatorStreamWindowVisible: () => true
}))
vi.mock('./use-emulator-pane-size', () => ({
  useEmulatorPaneSize: () => ({ paneRef: useRef<HTMLDivElement>(null), paneSize: null })
}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

type Frame = { streamId: string; bytes: ArrayBuffer }
type StreamError = { streamId: string; message: string }
async function mount(previewUrl = 'http://fixture.invalid/stream', extraApi: object = {}) {
  const frames = new Set<(message: Frame) => void>()
  const errors = new Set<(message: StreamError) => void>()
  const stopFrameStream = vi.fn(async () => {})
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      emulator: {
        startFrameStream: vi.fn(async () => ({ streamId: 'fixture-stream' })),
        stopFrameStream,
        onFrameStreamFrame: (callback: (message: Frame) => void) => {
          frames.add(callback)
          return () => frames.delete(callback)
        },
        onFrameStreamError: (callback: (message: StreamError) => void) => {
          errors.add(callback)
          return () => errors.delete(callback)
        },
        ...extraApi
      }
    }
  })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture-frame')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 200)
  )
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () =>
    root.render(
      <EmulatorDeviceFrame
        previewUrl={previewUrl}
        loading={false}
        isLive
        isActive
        visualOrientation="portrait"
        onTap={vi.fn()}
        onGesture={vi.fn()}
      />
    )
  )
  return {
    container,
    frames,
    errors,
    stopFrameStream,
    revoke,
    dispose: async () => {
      await act(async () => root.unmount())
      container.remove()
      Object.defineProperty(window, 'api', { configurable: true, value: undefined })
    }
  }
}

describe('native stream observer effects in the existing frame owner', () => {
  it('derives geometry from a stream image load and releases the subscription and blob', async () => {
    const state = await mount()
    try {
      await act(async () => {
        for (const callback of state.frames) {
          callback({ streamId: 'fixture-stream', bytes: new ArrayBuffer(4) })
        }
      })
      const image = state.container.querySelector('img')
      if (!image) {
        throw new Error('Missing native stream image')
      }
      Object.defineProperties(image, {
        naturalWidth: { value: 100 },
        naturalHeight: { value: 200 }
      })
      await act(async () => image.dispatchEvent(new Event('load')))
      expect(
        state.container.querySelector<HTMLElement>('[data-emulator-screen]')?.style.aspectRatio
      ).toBe('0.5 / 1')
    } finally {
      await state.dispose()
    }
    expect(state.frames.size).toBe(0)
    expect(state.errors.size).toBe(0)
    expect(state.stopFrameStream).toHaveBeenCalledWith({ streamId: 'fixture-stream' })
    expect(state.revoke).toHaveBeenCalledWith('blob:fixture-frame')
  })
  it('propagates a native stream failure to disconnected UI and blocks wheel input', async () => {
    const state = await mount()
    try {
      await act(async () => {
        for (const callback of state.errors) {
          callback({ streamId: 'fixture-stream', message: 'fixture disconnected' })
        }
      })
      expect(state.container.textContent).toContain('Stream disconnected')
      await expect(
        dispatchEmulatorFrameCommand(state.container, {
          type: 'wheel',
          clientX: 50,
          clientY: 100,
          deltaX: 0,
          deltaY: 10,
          deltaMode: 0
        })
      ).rejects.toThrow('emulator_not_interactable')
      expect(fixture.sendTouch).not.toHaveBeenCalled()
    } finally {
      await state.dispose()
    }
    expect(state.frames.size).toBe(0)
    expect(state.errors.size).toBe(0)
  })
  it('propagates H264 metadata and decoder failure through the existing owner and cleans up', async () => {
    type Meta = {
      streamId: string
      deviceId: string
      meta: { codecId: string; width: number; height: number }
    }
    let streamId = ''
    let decoderError: VideoDecoderInit['error'] = () => {}
    const metaListeners = new Set<(message: Meta) => void>()
    const close = vi.fn()
    const stopVideoStream = vi.fn(async () => {})
    vi.stubGlobal(
      'VideoDecoder',
      class {
        state = 'configured'
        constructor(init: VideoDecoderInit) {
          decoderError = init.error
        }
        close() {
          this.state = 'closed'
          close()
        }
      }
    )
    vi.stubGlobal('EncodedVideoChunk', class {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const state = await mount('scrcpy://fixture-device', {
      startVideoStream: vi.fn(async (args: { streamId: string }) => {
        streamId = args.streamId
        return { streamId }
      }),
      stopVideoStream,
      onVideoStreamMeta: (callback: (message: Meta) => void) => {
        metaListeners.add(callback)
        return () => metaListeners.delete(callback)
      },
      onVideoStreamFrame: () => () => {}
    })
    try {
      await act(async () => {
        for (const callback of metaListeners) {
          callback({
            streamId,
            deviceId: 'fixture-device',
            meta: { codecId: 'h264', width: 100, height: 200 }
          })
        }
      })
      expect(
        state.container.querySelector<HTMLElement>('[data-emulator-screen]')?.style.aspectRatio
      ).toBe('0.5 / 1')
      await act(async () => decoderError(new DOMException('fixture decoder failure')))
      expect(state.container.textContent).toContain('Stream disconnected')
      expect(metaListeners.size).toBe(0)
      expect(stopVideoStream).toHaveBeenCalledWith({ streamId })
      expect(close).toHaveBeenCalledTimes(1)
    } finally {
      await state.dispose()
    }
    expect(close).toHaveBeenCalledTimes(1)
  })
})
