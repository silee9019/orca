import { randomUUID } from 'node:crypto'
import { ipcMain, type IpcMainEvent } from 'electron'
import { getTrustedUIRendererWebContents } from '../ipc/ui'
import { InvalidArgumentError } from '../runtime/rpc/core'
import {
  NOTIFICATION_SOUND_CLI_REQUEST,
  NOTIFICATION_SOUND_CLI_RESULT,
  NotificationSoundCliResult
} from '../../shared/notification-sound-cli'
import type { NotificationSoundResult } from '../../shared/notification-settings-types'

export async function requestDesktopNotificationSound(
  options: { force?: boolean; volume?: number },
  signal?: AbortSignal
): Promise<NotificationSoundResult> {
  const renderer = getTrustedUIRendererWebContents()
  if (!renderer) {
    throw new InvalidArgumentError('desktop_unavailable')
  }
  if (signal?.aborted) {
    throw new InvalidArgumentError('request_cancelled')
  }
  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    const finish = (result?: NotificationSoundResult, error?: Error): void => {
      clearTimeout(timeout)
      ipcMain.removeListener(NOTIFICATION_SOUND_CLI_RESULT, onResult)
      signal?.removeEventListener('abort', onAbort)
      if (error) {
        reject(error)
      } else if (result) {
        resolve(result)
      }
    }
    const onResult = (event: IpcMainEvent, payload: unknown): void => {
      if (event.sender !== renderer) {
        return
      }
      const parsed = NotificationSoundCliResult.safeParse(payload)
      if (parsed.success && parsed.data.requestId === requestId) {
        finish(parsed.data.result)
      }
    }
    const onAbort = (): void => finish(undefined, new InvalidArgumentError('request_cancelled'))
    const timeout = setTimeout(
      () => finish(undefined, new InvalidArgumentError('desktop_ack_timeout')),
      5000
    )
    ipcMain.on(NOTIFICATION_SOUND_CLI_RESULT, onResult)
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      renderer.send(NOTIFICATION_SOUND_CLI_REQUEST, { requestId, ...options })
    } catch {
      finish(undefined, new InvalidArgumentError('desktop_unavailable'))
    }
  })
}
