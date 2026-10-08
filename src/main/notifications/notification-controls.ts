import type {
  NotificationDeliveryProbeResult,
  NotificationDismissResult,
  NotificationDispatchRequest,
  NotificationDispatchResult,
  NotificationPermissionStatusResult
} from '../../shared/notification-settings-types'

export type NotificationControls = {
  getPermissionStatus: () => NotificationPermissionStatusResult
  getDesktopAwayState: () => boolean | undefined
  openSystemSettings: () => Promise<boolean>
  probeDelivery: (args?: { force?: boolean }) => Promise<NotificationDeliveryProbeResult>
  dismiss: (ids: string[], paneKeys?: string[]) => NotificationDismissResult
  dispatch: (
    args: NotificationDispatchRequest
  ) => NotificationDispatchResult | Promise<NotificationDispatchResult>
}

let notificationControls: NotificationControls | null = null

export function installNotificationControls(controls: NotificationControls): void {
  notificationControls = controls
}

export function getNotificationControls(): NotificationControls | null {
  return notificationControls
}
