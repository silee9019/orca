import { randomUUID } from 'node:crypto'
import { defineMethod, defineStreamingMethod, type RpcContext } from '../core'
import { EmulatorError } from '../../../emulator/emulator-errors'
import {
  streamEmulatorObservation,
  type EmulatorObservationEvent
} from '../../../emulator/emulator-observation-stream'
import {
  EmulatorObservationParams,
  EmulatorStreamStopParams
} from '../../../../shared/rpc-contract/emulator-observation-params'

async function startStream(
  params: { worktree: string; timeoutMs: number },
  context: RpcContext,
  emit: (event: unknown) => void,
  codec: 'mjpeg' | 'h264'
): Promise<void> {
  const session = await context.runtime.emulatorStreamInfo(params)
  if ((session.streamCodec ?? 'mjpeg') !== codec) {
    throw new EmulatorError(
      'emulator_unsupported',
      `This device does not provide a ${codec} stream.`
    )
  }
  if (context.signal?.aborted) {
    return
  }
  const controller = new AbortController()
  const subscriptionId = `emulator-stream:${context.connectionId ?? 'inproc'}:${randomUUID()}`
  const onAbort = (): void => controller.abort()
  context.signal?.addEventListener('abort', onAbort, { once: true })
  context.runtime.registerSubscriptionCleanup(subscriptionId, onAbort, context.connectionId)
  try {
    emit({ type: 'ready', subscriptionId, deviceId: session.deviceUdid, codec })
    await streamEmulatorObservation(session, {
      signal: controller.signal,
      timeoutMs: params.timeoutMs,
      finishOnTimeout: true,
      emit
    })
    emit({ type: 'end', reason: controller.signal.aborted ? 'cancelled' : 'duration' })
  } finally {
    context.signal?.removeEventListener('abort', onAbort)
    context.runtime.cleanupSubscription(subscriptionId)
  }
}

function stopStream(
  params: { subscriptionId: string },
  { runtime, connectionId }: RpcContext
): { stopped: boolean } {
  if (!params.subscriptionId.startsWith(`emulator-stream:${connectionId ?? 'inproc'}:`)) {
    throw new EmulatorError('emulator_error', 'The emulator stream belongs to another connection.')
  }
  return {
    stopped: runtime.cleanupSubscriptionIfOwnedByConnection(params.subscriptionId, connectionId)
  }
}

export const EMULATOR_OBSERVATION_METHODS = [
  defineStreamingMethod({
    name: 'emulator.startFrameStream',
    params: EmulatorObservationParams,
    handler: (params, context, emit) => startStream(params, context, emit, 'mjpeg')
  }),
  defineStreamingMethod({
    name: 'emulator.startVideoStream',
    params: EmulatorObservationParams,
    handler: (params, context, emit) => startStream(params, context, emit, 'h264')
  }),
  defineMethod({
    name: 'emulator.stopFrameStream',
    params: EmulatorStreamStopParams,
    handler: stopStream
  }),
  defineMethod({
    name: 'emulator.stopVideoStream',
    params: EmulatorStreamStopParams,
    handler: stopStream
  }),
  defineMethod({
    name: 'emulator.observe',
    params: EmulatorObservationParams,
    handler: async (params, context) => {
      const session = await context.runtime.emulatorStreamInfo(params)
      const controller = new AbortController()
      const onAbort = (): void => controller.abort()
      context.signal?.addEventListener('abort', onAbort, { once: true })
      if (context.signal?.aborted) {
        controller.abort()
      }
      let meta: Extract<EmulatorObservationEvent, { type: 'meta' }> | undefined
      let config: Extract<EmulatorObservationEvent, { type: 'frame' }> | undefined
      let frame: Extract<EmulatorObservationEvent, { type: 'frame' }> | undefined
      try {
        await streamEmulatorObservation(session, {
          signal: controller.signal,
          timeoutMs: params.timeoutMs,
          emit: (event) => {
            if (event.type === 'meta') {
              meta = event
            } else if (event.config) {
              config = event
            } else if (event.keyFrame) {
              frame = event
              controller.abort()
            }
          }
        })
        if (!frame) {
          throw new EmulatorError(
            'emulator_error',
            'Emulator observation was cancelled before a frame arrived.'
          )
        }
        return {
          deviceId: session.deviceUdid,
          codec: session.streamCodec ?? 'mjpeg',
          events: [...(meta ? [meta] : []), ...(config ? [config] : []), frame]
        }
      } finally {
        context.signal?.removeEventListener('abort', onAbort)
        controller.abort()
      }
    }
  })
]
