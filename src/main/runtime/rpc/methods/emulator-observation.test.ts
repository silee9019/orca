import '../unused-default-rpc-methods.test-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { RpcDispatcher } from '../dispatcher'
import { OrcaRuntimeService } from '../../orca-runtime'
import { EMULATOR_OBSERVATION_METHODS } from './emulator-observation'
import { scrcpyVideoRegistry } from '../../../emulator/scrcpy-video-registry'
import { EmulatorObservationParams } from '../../../../shared/rpc-contract/emulator-observation-params'

const deviceId = 'rpc-fixture-device'
const session = {
  deviceUdid: deviceId,
  streamUrl: `scrcpy://${deviceId}`,
  wsUrl: '',
  streamCodec: 'h264' as const
}
const Ready = z.object({
  result: z.object({ type: z.literal('ready'), subscriptionId: z.string() })
})
const request = (method: string, params: unknown) => ({
  id: 'fixture',
  authToken: 'fixture',
  method,
  params
})

afterEach(() => {
  vi.restoreAllMocks()
  scrcpyVideoRegistry.stop(deviceId)
})

describe('emulator streaming RPC lifecycle', () => {
  it('allows only the owning connection to stop its stream and keeps the provider alive', async () => {
    const runtime = new OrcaRuntimeService()
    vi.spyOn(runtime, 'emulatorStreamInfo').mockResolvedValue(session)
    const close = vi.fn()
    scrcpyVideoRegistry.register(deviceId, close)
    const dispatcher = new RpcDispatcher({ runtime, methods: EMULATOR_OBSERVATION_METHODS })
    const messages: unknown[] = []
    const pending = dispatcher.dispatchStreaming(
      request('emulator.startVideoStream', { worktree: 'folder:mobile' }),
      (reply) => messages.push(JSON.parse(reply)),
      { connectionId: 'owner' }
    )
    try {
      await vi.waitFor(() => expect(messages).toHaveLength(1))
      const { subscriptionId } = Ready.parse(messages[0]).result
      await expect(
        dispatcher.dispatch(request('emulator.stopVideoStream', { subscriptionId }), {
          connectionId: 'intruder'
        })
      ).resolves.toMatchObject({ ok: false, error: { code: 'emulator_error' } })
      scrcpyVideoRegistry.pushMeta(deviceId, { codecId: 'h264', width: 100, height: 200 })
      expect(messages).toHaveLength(2)
      await expect(
        dispatcher.dispatch(request('emulator.stopVideoStream', { subscriptionId }), {
          connectionId: 'owner'
        })
      ).resolves.toMatchObject({ ok: true, result: { stopped: true } })
      await pending
      const count = messages.length
      scrcpyVideoRegistry.pushFrame(deviceId, {
        config: false,
        keyFrame: true,
        pts: '1',
        bytes: new Uint8Array([1]).buffer
      })
      expect(messages).toHaveLength(count)
      expect(close).not.toHaveBeenCalled()
      expect(scrcpyVideoRegistry.has(deviceId)).toBe(true)
    } finally {
      runtime.cleanupSubscriptionsForConnection('owner')
      await pending
    }
  })

  it('releases a subscription on connection cancellation', async () => {
    const runtime = new OrcaRuntimeService()
    vi.spyOn(runtime, 'emulatorStreamInfo').mockResolvedValue(session)
    scrcpyVideoRegistry.register(deviceId, vi.fn())
    const dispatcher = new RpcDispatcher({ runtime, methods: EMULATOR_OBSERVATION_METHODS })
    const controller = new AbortController()
    const messages: unknown[] = []
    const pending = dispatcher.dispatchStreaming(
      request('emulator.startVideoStream', { worktree: 'folder:mobile' }),
      (reply) => messages.push(JSON.parse(reply)),
      { connectionId: 'owner', signal: controller.signal }
    )
    await vi.waitFor(() => expect(messages).toHaveLength(1))
    controller.abort()
    await pending
    const count = messages.length
    scrcpyVideoRegistry.pushMeta(deviceId, { codecId: 'h264', width: 100, height: 200 })
    expect(messages).toHaveLength(count)
    expect(scrcpyVideoRegistry.has(deviceId)).toBe(true)
  })

  it('rejects the wrong device codec and untrusted stream URLs', async () => {
    const runtime = new OrcaRuntimeService()
    vi.spyOn(runtime, 'emulatorStreamInfo').mockResolvedValue(session)
    const dispatcher = new RpcDispatcher({ runtime, methods: EMULATOR_OBSERVATION_METHODS })
    const messages: unknown[] = []
    await dispatcher.dispatchStreaming(
      request('emulator.startFrameStream', { worktree: 'folder:mobile' }),
      (reply) => messages.push(JSON.parse(reply)),
      { connectionId: 'owner' }
    )
    expect(messages).toEqual([
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'emulator_unsupported' })
      })
    ])
    expect(() =>
      EmulatorObservationParams.parse({
        worktree: 'folder:mobile',
        streamUrl: 'http://untrusted/stream.mjpeg'
      })
    ).toThrow()
    expect(() => EmulatorObservationParams.parse({ worktree: '', timeoutMs: 1 })).toThrow()
    expect(() =>
      EmulatorObservationParams.parse({ worktree: 'folder:mobile', timeoutMs: 60001 })
    ).toThrow()
  })
})
