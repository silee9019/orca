import { MjpegFrameStream } from './mjpeg-frame-stream'
import { scrcpyVideoRegistry } from './scrcpy-video-registry'
import { EmulatorError } from './emulator-errors'
import type { EmulatorSessionInfo } from './emulator-types'
import type { ScrcpyVideoMeta } from './android/scrcpy-video-frame-parser'

export type EmulatorObservationEvent =
  | { type: 'meta'; deviceId: string; meta: ScrcpyVideoMeta }
  | {
      type: 'frame'
      deviceId: string
      codec: 'jpeg' | 'h264'
      data: string
      config: boolean
      keyFrame: boolean
      pts?: string
    }

export async function streamEmulatorObservation(
  session: EmulatorSessionInfo,
  options: {
    signal: AbortSignal
    timeoutMs: number
    finishOnTimeout?: boolean
    emit: (event: EmulatorObservationEvent) => void
  }
): Promise<void> {
  if (options.signal.aborted) {
    return
  }
  await new Promise<void>((resolve, reject) => {
    let dispose = (): void => {}
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      options.signal.removeEventListener('abort', onAbort)
      dispose()
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    const emit = (event: EmulatorObservationEvent): void => {
      try {
        options.emit(event)
      } catch {
        finish(new EmulatorError('emulator_error', 'Emulator stream consumer failed.'))
      }
    }
    const onAbort = (): void => finish()
    const timer = setTimeout(
      () =>
        finish(
          options.finishOnTimeout
            ? undefined
            : new EmulatorError('emulator_error', 'Emulator observation timed out.')
        ),
      options.timeoutMs
    )
    options.signal.addEventListener('abort', onAbort, { once: true })
    try {
      if (session.streamCodec === 'h264') {
        if (!scrcpyVideoRegistry.has(session.deviceUdid)) {
          throw new EmulatorError(
            'emulator_no_active',
            'No video stream exists for this device. Attach it first.'
          )
        }
        dispose = scrcpyVideoRegistry.subscribe(session.deviceUdid, (event) => {
          if (settled) {
            return
          }
          if (event.type === 'meta') {
            emit({ type: 'meta', deviceId: session.deviceUdid, meta: event.meta })
          } else {
            emit({
              type: 'frame',
              deviceId: session.deviceUdid,
              codec: 'h264',
              data: Buffer.from(event.frame.bytes).toString('base64'),
              config: event.frame.config,
              keyFrame: event.frame.keyFrame,
              pts: event.frame.pts
            })
          }
        })
        // Cached video events may synchronously cancel observation during subscribe.
        if (settled) {
          dispose()
        }
      } else {
        const stream = new MjpegFrameStream(session.streamUrl, {
          onError: () =>
            finish(new EmulatorError('emulator_error', 'Emulator frame stream failed.')),
          onFrame: (frame) => {
            if (!settled) {
              emit({
                type: 'frame',
                deviceId: session.deviceUdid,
                codec: 'jpeg',
                data: frame.toString('base64'),
                config: false,
                keyFrame: true
              })
            }
          }
        })
        dispose = () => stream.stop()
        stream.start()
      }
    } catch (error) {
      finish(
        error instanceof Error
          ? error
          : new EmulatorError('emulator_error', 'Emulator observation failed.')
      )
    }
  })
}
