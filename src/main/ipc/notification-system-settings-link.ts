import { shell } from 'electron'

const MACOS_PACKAGED_BUNDLE_ID = 'com.stablyai.orca'
const MACOS_NOTIFICATION_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.Notifications-Settings.extension'

function getMacNotificationSettingsUrl(): string {
  const bundleId = process.env.ORCA_DEV_MACOS_BUNDLE_ID ?? MACOS_PACKAGED_BUNDLE_ID
  return `${MACOS_NOTIFICATION_SETTINGS_URL}?id=${encodeURIComponent(bundleId)}`
}

export async function openNotificationSystemSettings(): Promise<boolean> {
  if (process.platform === 'darwin') {
    await shell.openExternal(getMacNotificationSettingsUrl())
  } else if (process.platform === 'win32') {
    await shell.openExternal('ms-settings:notifications')
  } else {
    return false
  }
  return true
}
