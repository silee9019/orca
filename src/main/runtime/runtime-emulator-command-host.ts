import type { BrowserWindow } from 'electron'
import type { EmulatorBridge } from '../emulator/emulator-bridge'
import type { GlobalSettings } from '../../shared/global-settings-types'

type EmulatorHostSettings = Pick<
  GlobalSettings,
  'mobileEmulatorEnabled' | 'mobileEmulatorDefaultDeviceUdid' | 'androidSdkPath'
>

export type RuntimeEmulatorCommandHost = {
  getEmulatorBridge(): EmulatorBridge | null
  resolveEmulatorWorkspaceId(selector: string): Promise<string>
  resolveEmulatorCleanupWorkspaceId(selector: string): Promise<string>
  getAuthoritativeWindow(): BrowserWindow
  getSettings(): EmulatorHostSettings
}
