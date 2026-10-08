import WebSocket from 'ws'
import { EmulatorError } from './emulator-errors'
import {
  buildServeSimKeyboardFramesForKey,
  encodeServeSimKeyboardFrame
} from '../../shared/emulator-keyboard-frame'
import {
  encodeServeSimTouchFrame,
  type ServeSimTouchFrame
} from '../../shared/emulator-touch-frame'
import type { EmulatorControlEvent } from '../../shared/rpc-contract/emulator-control-params'

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
    if (signal.aborted) {
      finish()
    }
  })
}

export async function sendEmulatorControlSequence(
  wsUrl: string,
  events: EmulatorControlEvent[],
  signal: AbortSignal
): Promise<void> {
  for (const event of events) {
    if (
      event.type === 'key' &&
      !buildServeSimKeyboardFramesForKey(event.key, { shift: event.shift })
    ) {
      throw new EmulatorError('emulator_unsupported', 'Unsupported emulator keyboard key.')
    }
  }
  if (!wsUrl) {
    throw new EmulatorError(
      'emulator_unsupported',
      'This device does not provide live keyboard and touch control.'
    )
  }
  if (signal.aborted) {
    return
  }
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const lifetime = new AbortController()
    const pressed = new Set<number>()
    let touch: ServeSimTouchFrame | undefined
    let completed = false
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(deadline)
      signal.removeEventListener('abort', abort)
      lifetime.abort()
      if (error) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            release()
            const grace = setTimeout(() => {
              ws.terminate()
              reject(
                new EmulatorError(
                  'emulator_error',
                  'Emulator control failed; held input release could not be verified.'
                )
              )
            }, 500)
            ws.once('close', () => {
              clearTimeout(grace)
              reject(error)
            })
            ws.close()
            return
          } catch {
            // A failed control socket cannot confirm release of held input.
          }
        }
        ws.terminate()
        reject(
          new EmulatorError(
            'emulator_error',
            'Emulator control failed; held input release could not be verified.'
          )
        )
      } else {
        resolve()
      }
    }
    const release = (): void => {
      if (ws.readyState !== WebSocket.OPEN) {
        return
      }
      for (const usage of [...pressed].toReversed()) {
        ws.send(encodeServeSimKeyboardFrame({ type: 'up', usage }))
      }
      pressed.clear()
      if (touch) {
        ws.send(encodeServeSimTouchFrame({ ...touch, type: 'end' }))
      }
      touch = undefined
    }
    const abort = (): void => {
      lifetime.abort()
      if (ws.readyState === WebSocket.CONNECTING) {
        completed = true
        ws.terminate()
      }
    }
    const deadline = setTimeout(
      () => finish(new EmulatorError('emulator_error', 'Emulator control timed out.')),
      65000
    )
    signal.addEventListener('abort', abort, { once: true })
    ws.on('error', () =>
      finish(
        completed
          ? undefined
          : new EmulatorError('emulator_error', 'Emulator control connection failed.')
      )
    )
    ws.on('close', () =>
      finish(
        completed
          ? undefined
          : new EmulatorError(
              'emulator_error',
              'Emulator control connection closed before completion.'
            )
      )
    )
    ws.on('open', () => {
      void (async () => {
        try {
          for (const event of events) {
            if (signal.aborted || settled) {
              break
            }
            if (event.type === 'wait') {
              await pause(event.ms, lifetime.signal)
            } else if (event.type === 'blur') {
              release()
            } else if (event.type === 'touch') {
              const frame: ServeSimTouchFrame = {
                type: event.phase === 'cancel' ? 'end' : event.phase,
                x: event.x,
                y: event.y,
                ...(event.edge === undefined ? {} : { edge: event.edge })
              }
              ws.send(encodeServeSimTouchFrame(frame))
              touch = frame.type === 'end' ? undefined : frame
              await pause(16, lifetime.signal)
            } else {
              for (const frame of buildServeSimKeyboardFramesForKey(event.key, {
                shift: event.shift
              }) ?? []) {
                if (signal.aborted || settled) {
                  break
                }
                ws.send(encodeServeSimKeyboardFrame(frame))
                if (frame.type === 'down') {
                  pressed.add(frame.usage)
                } else {
                  pressed.delete(frame.usage)
                }
                await pause(20, lifetime.signal)
              }
            }
          }
          if (!settled) {
            release()
            completed = true
            ws.close()
          }
        } catch {
          finish(new EmulatorError('emulator_error', 'Emulator control failed.'))
        }
      })()
    })
  })
}
