import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  streamEmulatorObservation,
  type EmulatorObservationEvent
} from './emulator-observation-stream'
import { scrcpyVideoRegistry } from './scrcpy-video-registry'
import type { EmulatorSessionInfo } from './emulator-types'

const session: EmulatorSessionInfo = {
  deviceUdid: 'fixture-device',
  streamCodec: 'h264',
  streamUrl: 'scrcpy://fixture-device',
  wsUrl: ''
}

afterEach(() => {
  scrcpyVideoRegistry.stop(session.deviceUdid)
  vi.useRealTimers()
})

describe('emulator observation provider effects', () => {
  it('captures real MJPEG socket bytes and closes only its observation on cancel', async () => {
    const jpeg = Buffer.from([255, 216, 1, 2, 255, 217])
    const server = createServer((_req, res) => {
      res.writeHead(200)
      res.write(jpeg)
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Missing fixture port')
    }
    const controller = new AbortController()
    const events: EmulatorObservationEvent[] = []
    try {
      await streamEmulatorObservation(
        {
          ...session,
          streamCodec: 'mjpeg',
          streamUrl: `http://127.0.0.1:${address.port}/stream.mjpeg`
        },
        {
          signal: controller.signal,
          timeoutMs: 1000,
          emit: (event) => {
            events.push(event)
            controller.abort()
          }
        }
      )
      expect(events).toEqual([
        {
          type: 'frame',
          deviceId: 'fixture-device',
          codec: 'jpeg',
          data: jpeg.toString('base64'),
          config: false,
          keyFrame: true
        }
      ])
      expect(server.listening).toBe(true)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  })

  it('replays H264 metadata and config, cancels its listener and leaves the device live', async () => {
    const close = vi.fn()
    scrcpyVideoRegistry.register(session.deviceUdid, close)
    scrcpyVideoRegistry.pushMeta(session.deviceUdid, { codecId: 'h264', width: 100, height: 200 })
    scrcpyVideoRegistry.pushFrame(session.deviceUdid, {
      config: true,
      keyFrame: false,
      pts: '0',
      bytes: new Uint8Array([1, 2]).buffer
    })
    const controller = new AbortController()
    const events: EmulatorObservationEvent[] = []
    const pending = streamEmulatorObservation(session, {
      signal: controller.signal,
      timeoutMs: 1000,
      emit: (event) => events.push(event)
    })
    scrcpyVideoRegistry.pushFrame(session.deviceUdid, {
      config: false,
      keyFrame: true,
      pts: '3',
      bytes: new Uint8Array([3, 4]).buffer
    })
    controller.abort()
    await pending
    expect(events.map((event) => event.type)).toEqual(['meta', 'frame', 'frame'])
    expect(events[2]).toMatchObject({ codec: 'h264', keyFrame: true, data: 'AwQ=', pts: '3' })
    scrcpyVideoRegistry.pushFrame(session.deviceUdid, {
      config: false,
      keyFrame: false,
      pts: '4',
      bytes: new Uint8Array([5]).buffer
    })
    expect(events).toHaveLength(3)
    expect(close).not.toHaveBeenCalled()
    expect(scrcpyVideoRegistry.has(session.deviceUdid)).toBe(true)
  })

  it('removes the listener when cached frame delivery cancels synchronously', async () => {
    scrcpyVideoRegistry.register(session.deviceUdid, vi.fn())
    scrcpyVideoRegistry.pushFrame(session.deviceUdid, {
      config: false,
      keyFrame: true,
      pts: '1',
      bytes: new Uint8Array([1]).buffer
    })
    const controller = new AbortController()
    const emit = vi.fn(() => controller.abort())
    await streamEmulatorObservation(session, { signal: controller.signal, timeoutMs: 1000, emit })
    scrcpyVideoRegistry.pushFrame(session.deviceUdid, {
      config: false,
      keyFrame: true,
      pts: '2',
      bytes: new Uint8Array([2]).buffer
    })
    expect(emit).toHaveBeenCalledOnce()
  })

  it('rejects asynchronously throwing consumers and removes their subscription', async () => {
    const close = vi.fn()
    scrcpyVideoRegistry.register(session.deviceUdid, close)
    const emit = vi.fn(() => {
      throw new Error('consumer secret')
    })
    const pending = streamEmulatorObservation(session, {
      signal: new AbortController().signal,
      timeoutMs: 1000,
      emit
    })
    const rejected = expect(pending).rejects.toThrow('Emulator stream consumer failed.')
    scrcpyVideoRegistry.pushFrame(session.deviceUdid, {
      config: false,
      keyFrame: true,
      pts: '1',
      bytes: new Uint8Array([1]).buffer
    })
    await rejected
    scrcpyVideoRegistry.pushFrame(session.deviceUdid, {
      config: false,
      keyFrame: true,
      pts: '2',
      bytes: new Uint8Array([2]).buffer
    })
    expect(emit).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
  })

  it('rejects a missing device stream instead of returning an empty success', async () => {
    await expect(
      streamEmulatorObservation(session, {
        signal: new AbortController().signal,
        timeoutMs: 1000,
        emit: vi.fn()
      })
    ).rejects.toMatchObject({ code: 'emulator_no_active' })
  })

  it('cleans up after a timeout without killing the provider', async () => {
    vi.useFakeTimers()
    const close = vi.fn()
    scrcpyVideoRegistry.register(session.deviceUdid, close)
    const emit = vi.fn()
    const pending = streamEmulatorObservation(session, {
      signal: new AbortController().signal,
      timeoutMs: 100,
      emit
    })
    const rejected = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(100)
    await rejected
    scrcpyVideoRegistry.pushFrame(session.deviceUdid, {
      config: false,
      keyFrame: true,
      pts: '2',
      bytes: new Uint8Array([2]).buffer
    })
    expect(emit).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })
})
