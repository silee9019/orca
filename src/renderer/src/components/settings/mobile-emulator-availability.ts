import { translate } from '@/i18n/i18n'

export type SimulatorDeviceRow = {
  name: string
  udid: string
  state: string
  runtime?: string
  isAvailable?: boolean
}

export type EmulatorAvailability = {
  platform: string
  available: boolean
  devices: SimulatorDeviceRow[]
  simctl: { ok: boolean; message?: string }
  serveSim: { ok: boolean; message?: string }
  android: { sdkFound: boolean; sdkPath?: string; message: string }
  message: string
}

export function statusText(availability: EmulatorAvailability | null, enabled: boolean): string {
  if (!enabled) {
    return translate('auto.components.settings.MobileEmulatorSettingsPane.a4f1c82d90', 'Disabled')
  }
  if (!availability) {
    return translate(
      'auto.components.settings.MobileEmulatorSettingsPane.b5e2d93e01',
      'Checking...'
    )
  }
  return availability.available
    ? translate('auto.components.settings.MobileEmulatorSettingsPane.c6f3ea4f12', 'Ready')
    : translate('auto.components.settings.MobileEmulatorSettingsPane.d704fb5023', 'Needs setup')
}

export function statusBadgeClassName(
  availability: EmulatorAvailability | null,
  enabled: boolean
): string {
  if (!enabled) {
    return 'border-border/50 bg-muted/30 text-muted-foreground'
  }
  if (!availability) {
    return 'border-border/50 bg-muted/30 text-muted-foreground'
  }
  return availability.available
    ? 'border-status-success-border bg-status-success-background text-status-success'
    : 'border-destructive/30 bg-destructive/10 text-destructive'
}

export function availabilityDetail(availability: EmulatorAvailability | null): string {
  if (!availability) {
    return translate(
      'auto.components.settings.MobileEmulatorSettingsPane.06b06429c6',
      'Checking Android SDK and iOS Simulator support.'
    )
  }
  if (availability.available) {
    return availability.devices.length === 1
      ? translate(
          'auto.components.settings.MobileEmulatorSettingsPane.6d1483d4a0',
          '1 emulator device detected.'
        )
      : translate(
          'auto.components.settings.MobileEmulatorSettingsPane.0a452d4d3b',
          '{{value0}} emulator devices detected.',
          { value0: availability.devices.length }
        )
  }
  return availability.simctl.message || availability.serveSim.message || availability.message
}
