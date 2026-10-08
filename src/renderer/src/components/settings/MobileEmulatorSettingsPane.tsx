import {
  statusText,
  statusBadgeClassName,
  availabilityDetail,
  type SimulatorDeviceRow,
  type EmulatorAvailability
} from './mobile-emulator-availability'
import {
  useEmulatorSettingsViewer,
  type EmulatorSdkActions,
  type EmulatorSkillActions
} from '@/runtime/emulator-settings-viewer'
import { useAppStore } from '@/store'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { cn } from '@/lib/utils'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { AndroidLogo, IosBrandIcon } from '../mobile/MobileBrandIcons'
import { MobileEmulatorAgentControlRow } from './MobileEmulatorAgentControlRow'
import { copyEmulatorExamplePrompt } from './MobileEmulatorExamples'
import { MobileEmulatorAvailabilityDetails } from './MobileEmulatorAvailabilityDetails'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow, SettingsSwitchRow } from './SettingsFormControls'
import { getMobileEmulatorSearchEntries } from './mobile-emulator-search'
import { translate } from '@/i18n/i18n'

type MobileEmulatorSettingsPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
}

const AUTOMATIC_DEVICE_VALUE = '__orca_automatic_emulator_device__'
const AUTOMATIC_DEVICE_LABEL = 'Auto-select device'
const SIMULATOR_STATE_SUFFIX_RE =
  /\s+\((Booted|Booting|Creating|Shutdown|Shutting Down|Unavailable|Unknown)\)\s*$/i

function deviceLabel(device: SimulatorDeviceRow): string {
  const state = device.state.trim()
  const name = device.name.replace(SIMULATOR_STATE_SUFFIX_RE, '').trim()
  if (device.isAvailable === false) {
    return `${name} (Unavailable)`
  }
  if (!state || state.toLowerCase() === 'shutdown') {
    return name
  }
  return `${name} (${state})`
}

function isAndroidDevice(device: SimulatorDeviceRow): boolean {
  return device.runtime === 'Android'
}

function DeviceSelectItemLabel({ device }: { device: SimulatorDeviceRow }): React.JSX.Element {
  const Icon = isAndroidDevice(device) ? AndroidLogo : IosBrandIcon
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon className="size-3.5 shrink-0 fill-current text-muted-foreground" />
      <span className="truncate">{deviceLabel(device)}</span>
    </span>
  )
}

export function MobileEmulatorSettingsPane({
  settings,
  updateSettings
}: MobileEmulatorSettingsPaneProps): React.JSX.Element {
  const [availability, setAvailability] = useState<EmulatorAvailability | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const enabled = settings.mobileEmulatorEnabled !== false
  const refreshingRef = useRef(false)
  const changing = useRef(false)
  const sdkRevision = useRef(0)
  const refreshedAvailability = useRef<EmulatorAvailability | null>(null)
  const details = useRef<EmulatorSdkActions | null>(null)
  const skill = useRef<EmulatorSkillActions | null>(null)
  const registerSkillActions = useCallback((actions: EmulatorSkillActions) => {
    skill.current = actions
    return () => {
      if (skill.current === actions) {
        skill.current = null
      }
    }
  }, [])
  const registerSdkActions = useCallback((actions: EmulatorSdkActions) => {
    details.current = actions
    return () => {
      if (details.current === actions) {
        details.current = null
      }
    }
  }, [])

  const refreshAvailability = useCallback(async (): Promise<boolean> => {
    if (refreshingRef.current) {
      return false
    }
    refreshingRef.current = true
    setRefreshing(true)
    try {
      const result = await callRuntimeRpc<EmulatorAvailability>(
        { kind: 'local' },
        'emulator.availability',
        {}
      )
      refreshedAvailability.current = result
      setAvailability(result)
      return true
    } catch {
      setAvailability({
        platform: '',
        available: false,
        devices: [],
        simctl: { ok: false },
        serveSim: { ok: false },
        android: { sdkFound: false, message: '' },
        message: 'Could not check emulator availability.'
      })
      return false
    } finally {
      refreshingRef.current = false
      setRefreshing(false)
    }
  }, [])

  const setSetting = useCallback(
    async (updates: Partial<GlobalSettings>): Promise<boolean> => {
      if (changing.current) {
        return false
      }
      changing.current = true
      try {
        await updateSettings(updates)
        const persisted = await window.api.settings.get()
        return Object.entries(updates).every(
          ([key, value]) => (Reflect.get(persisted, key) ?? null) === (value ?? null)
        )
      } catch {
        return false
      } finally {
        changing.current = false
      }
    },
    [updateSettings]
  )
  const setAndroidSdkPath = useCallback(
    async (path: string | null, expectedRevision?: number): Promise<boolean> => {
      if (
        changing.current ||
        refreshingRef.current ||
        (expectedRevision !== undefined && expectedRevision !== sdkRevision.current) ||
        useAppStore.getState().settings?.mobileEmulatorEnabled === false
      ) {
        return false
      }
      changing.current = true
      sdkRevision.current += 1
      try {
        await updateSettings({ androidSdkPath: path })
        const refreshed = await refreshAvailability()
        const persisted = await window.api.settings.get()
        return refreshed && (persisted.androidSdkPath ?? null) === path
      } catch {
        return false
      } finally {
        changing.current = false
      }
    },
    [updateSettings, refreshAvailability]
  )

  useEffect(() => {
    void refreshAvailability()
  }, [refreshAvailability])

  const devices = availability?.devices ?? []
  const selectedDeviceKnown = devices.some(
    (device) => device.udid === settings.mobileEmulatorDefaultDeviceUdid
  )
  const selectValue =
    settings.mobileEmulatorDefaultDeviceUdid && selectedDeviceKnown
      ? settings.mobileEmulatorDefaultDeviceUdid
      : AUTOMATIC_DEVICE_VALUE

  const defaultDeviceDescription = useMemo(() => {
    if (devices.length === 0) {
      return translate(
        'auto.components.settings.MobileEmulatorSettingsPane.f62a1bb759',
        'Orca will auto-select an emulator device after devices are detected.'
      )
    }
    return translate(
      'auto.components.settings.MobileEmulatorSettingsPane.b2fd62ea75',
      'Default device for new emulator tabs and agent attach commands. Auto-select prefers an already running device.'
    )
  }, [devices.length])

  const setDefaultDevice = (id: string | null): Promise<boolean> => {
    if (
      !enabled ||
      (id !== null && !devices.some((device) => device.udid === id && device.isAvailable !== false))
    ) {
      return Promise.resolve(false)
    }
    return setSetting({ mobileEmulatorDefaultDeviceUdid: id })
  }
  useEmulatorSettingsViewer({
    read: () => ({
      enabled,
      skillReady: skill.current?.matches(true) ?? false,
      availabilityKnown: availability !== null,
      available: availability?.available === true,
      refreshing,
      sdkPathSet: Boolean(settings.androidSdkPath),
      defaultDeviceSet: Boolean(settings.mobileEmulatorDefaultDeviceUdid),
      deviceCount: devices.length
    }),
    matchesSdk: (path) => (settings.androidSdkPath ?? null) === path,
    matchesDevice: (id) => (settings.mobileEmulatorDefaultDeviceUdid ?? null) === id,
    refresh: refreshAvailability,
    matchesRefresh: () => availability === refreshedAvailability.current,
    copyExample: copyEmulatorExamplePrompt,
    sdk: setAndroidSdkPath,
    enabled: (value) => setSetting({ mobileEmulatorEnabled: value }),
    device: setDefaultDevice,
    details: () => details.current,
    skill: () => skill.current
  })

  return (
    <div className="space-y-4">
      <SearchableSetting
        title={translate(
          'auto.components.settings.MobileEmulatorSettingsPane.6593c9ddd3',
          'Mobile Emulator'
        )}
        description={translate(
          'auto.components.settings.MobileEmulatorSettingsPane.bc39d0f115',
          'Configure mobile emulator support for Orca and coding agents.'
        )}
        keywords={getMobileEmulatorSearchEntries().flatMap((entry) => entry.keywords ?? [])}
        className="divide-y divide-border/40"
      >
        <SettingsSwitchRow
          label={translate(
            'auto.components.settings.MobileEmulatorSettingsPane.700ddbf9b1',
            'Enable Mobile Emulator'
          )}
          description={translate(
            'auto.components.settings.MobileEmulatorSettingsPane.f9af91ea26',
            'Shows the New Mobile Emulator action and allows agents to attach to the active emulator.'
          )}
          checked={enabled}
          onChange={() => setSetting({ mobileEmulatorEnabled: !enabled })}
        />

        <div className="py-2">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Label>
                {translate(
                  'auto.components.settings.MobileEmulatorSettingsPane.ae1612c58c',
                  'Availability'
                )}
              </Label>
              <p className="text-xs text-muted-foreground">{availabilityDetail(availability)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge
                variant="outline"
                className={cn('text-[11px]', statusBadgeClassName(availability, enabled))}
              >
                {refreshing ? <Loader2 className="size-3 animate-spin" /> : null}
                {statusText(availability, enabled)}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                aria-label={translate(
                  'auto.components.settings.MobileEmulatorSettingsPane.8aec2f99a0',
                  'Refresh emulator availability'
                )}
                onClick={() => void refreshAvailability()}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
              </Button>
            </div>
          </div>

          {enabled ? (
            <MobileEmulatorAvailabilityDetails
              registerSdkActions={registerSdkActions}
              getSdkRevision={() => sdkRevision.current}
              getSdkPath={() => useAppStore.getState().settings?.androidSdkPath ?? null}
              availability={availability}
              configuredPath={settings.androidSdkPath ?? null}
              onSetAndroidSdkPath={setAndroidSdkPath}
            />
          ) : null}
        </div>

        <SettingsRow
          alignTop
          label={translate(
            'auto.components.settings.MobileEmulatorSettingsPane.143961d031',
            'Default Device'
          )}
          description={defaultDeviceDescription}
          control={
            <Select
              value={selectValue}
              disabled={!enabled}
              onValueChange={(value) =>
                setDefaultDevice(value === AUTOMATIC_DEVICE_VALUE ? null : value)
              }
            >
              <SelectTrigger size="sm" className="w-56 max-w-full">
                <SelectValue placeholder={AUTOMATIC_DEVICE_LABEL} />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectItem value={AUTOMATIC_DEVICE_VALUE}>{AUTOMATIC_DEVICE_LABEL}</SelectItem>
                {devices.map((device) => (
                  <SelectItem
                    key={device.udid}
                    value={device.udid}
                    textValue={deviceLabel(device)}
                    disabled={device.isAvailable === false}
                  >
                    <DeviceSelectItemLabel device={device} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SearchableSetting>

      {enabled ? (
        <SearchableSetting
          title={translate(
            'auto.components.settings.MobileEmulatorSettingsPane.f2f8d97bb6',
            'Agent Mobile Emulator Control'
          )}
          description={translate(
            'auto.components.settings.MobileEmulatorSettingsPane.19d39113b6',
            'Let coding agents control the active mobile emulator with Orca CLI commands.'
          )}
          keywords={getMobileEmulatorSearchEntries()[3]?.keywords}
        >
          <MobileEmulatorAgentControlRow registerSkillActions={registerSkillActions} />
        </SearchableSetting>
      ) : null}
    </div>
  )
}
