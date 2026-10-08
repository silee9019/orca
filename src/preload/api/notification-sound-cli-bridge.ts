import { ipcRenderer } from 'electron'
import {
  NOTIFICATION_SOUND_CLI_REQUEST,
  NOTIFICATION_SOUND_CLI_RESULT,
  NotificationSoundCliRequest
} from '../../shared/notification-sound-cli'
import { notificationsApi } from './notifications-bridge'

export function registerNotificationSoundCliBridge(): () => void {
  const listener = (_event: unknown, payload: unknown): void => {
    const parsed = NotificationSoundCliRequest.safeParse(payload)
    if (!parsed.success) {
      return
    }
    const { requestId, ...options } = parsed.data
    void notificationsApi.playSound(options).then(
      (result) => ipcRenderer.send(NOTIFICATION_SOUND_CLI_RESULT, { requestId, result }),
      () =>
        ipcRenderer.send(NOTIFICATION_SOUND_CLI_RESULT, {
          requestId,
          result: { played: false, reason: 'playback-failed' }
        })
    )
  }
  ipcRenderer.on(NOTIFICATION_SOUND_CLI_REQUEST, listener)
  return () => ipcRenderer.removeListener(NOTIFICATION_SOUND_CLI_REQUEST, listener)
}
