import { useEffect, useRef } from 'react'
import type { EmulatorSdkActions } from '@/runtime/emulator-settings-viewer'
import { CheckCircle2, CircleAlert, FolderOpen, X } from 'lucide-react'
import type React from 'react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { translate } from '@/i18n/i18n'

type EmulatorAvailability = {
  platform: string
  simctl: { ok: boolean; message?: string }
  serveSim: { ok: boolean; message?: string }
  android: { sdkFound: boolean; sdkPath?: string; message: string }
}

type MobileEmulatorAvailabilityDetailsProps = {
  registerSdkActions?: (actions: EmulatorSdkActions) => () => void
  availability: EmulatorAvailability | null
  configuredPath?: string | null
  getSdkRevision?: () => number
  getSdkPath?: () => string | null
  onSetAndroidSdkPath: (
    path: string | null,
    expectedRevision?: number
  ) => void | boolean | Promise<void | boolean>
}

const ANDROID_STUDIO_URL = 'https://developer.android.com/studio'

function ToolchainStatusIcon({ ok }: { ok: boolean }): React.JSX.Element {
  return ok ? (
    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" />
  ) : (
    <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
  )
}

function ToolchainStatusRow({
  ok,
  title,
  detail,
  actions
}: {
  ok: boolean
  title: string
  detail: React.ReactNode
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 py-2">
      <ToolchainStatusIcon ok={ok} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 flex-1 break-words text-xs text-muted-foreground">{detail}</div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap justify-end gap-1">{actions}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const sdkPathActionClassName = 'h-6 px-2 text-muted-foreground hover:text-foreground'

export function MobileEmulatorAvailabilityDetails({
  registerSdkActions,
  availability,
  configuredPath,
  onSetAndroidSdkPath,
  getSdkRevision,
  getSdkPath
}: MobileEmulatorAvailabilityDetailsProps): React.JSX.Element | null {
  const pickedPath = useRef<string | null | undefined>(undefined)
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const android = availability?.android ?? { sdkFound: false, sdkPath: undefined, message: '' }
  const iosOk = Boolean(availability?.simctl?.ok && availability?.serveSim?.ok)
  const showIos = availability?.platform === 'darwin'
  const handleLocate = async (expiresAt?: number): Promise<boolean> => {
    if (busy.current || !availability || !mounted.current) {
      return false
    }
    busy.current = true
    const revision = getSdkRevision?.()
    const originalPath = getSdkPath?.()
    try {
      const picked = await window.api.shell.pickDirectory({
        defaultPath: android.sdkPath ?? configuredPath ?? undefined
      })
      if (
        !picked ||
        !mounted.current ||
        (getSdkPath !== undefined && originalPath !== getSdkPath()) ||
        (expiresAt !== undefined && Date.now() >= expiresAt)
      ) {
        return false
      }
      pickedPath.current = picked
      return (await onSetAndroidSdkPath(picked, revision)) === true
    } catch {
      if (mounted.current) {
        toast.error(
          translate(
            'auto.components.settings.MobileEmulatorSdkStatus.63fe73a1ea',
            'Could not update Android SDK folder.'
          )
        )
      }
      return false
    } finally {
      busy.current = false
    }
  }
  const handleClear = async (): Promise<boolean> => {
    if (busy.current || !configuredPath || !availability || !mounted.current) {
      return false
    }
    busy.current = true
    try {
      return (await onSetAndroidSdkPath(null)) === true
    } catch {
      if (mounted.current) {
        toast.error(
          translate(
            'auto.components.settings.MobileEmulatorSdkStatus.63fe73a1ea',
            'Could not update Android SDK folder.'
          )
        )
      }
      return false
    } finally {
      busy.current = false
    }
  }
  const openStudio = async (): Promise<boolean> => {
    if (busy.current || !availability || android.sdkFound || !mounted.current) {
      return false
    }
    busy.current = true
    try {
      await window.api.shell.openUrl(ANDROID_STUDIO_URL)
      return true
    } catch {
      return false
    } finally {
      busy.current = false
    }
  }
  const committed = useRef({ handleLocate, handleClear, openStudio, configuredPath })
  useEffect(() => {
    committed.current = { handleLocate, handleClear, openStudio, configuredPath }
  })
  const hasAvailability = availability !== null
  useEffect(() => {
    if (!hasAvailability) {
      return
    }
    return registerSdkActions?.({
      matches: () =>
        pickedPath.current !== undefined &&
        (committed.current.configuredPath ?? null) === pickedPath.current,
      locate: (expiresAt) => committed.current.handleLocate(expiresAt),
      clear: () => committed.current.handleClear(),
      studio: () => committed.current.openStudio()
    })
  }, [registerSdkActions, hasAvailability])
  if (!availability) {
    return null
  }

  return (
    <div className="mt-3">
      <div className="divide-y divide-border/40 rounded-md border border-border/50 px-3">
        <ToolchainStatusRow
          ok={android.sdkFound}
          title={translate(
            'auto.components.settings.MobileEmulatorSdkStatus.027cbf668a',
            'Android SDK'
          )}
          detail={
            android.sdkFound ? (
              <>
                {configuredPath
                  ? translate(
                      'auto.components.settings.MobileEmulatorSdkStatus.f6d080d128',
                      'Using configured path'
                    )
                  : translate(
                      'auto.components.settings.MobileEmulatorSdkStatus.7fe4bd5907',
                      'Detected at'
                    )}{' '}
                <code className="rounded bg-muted px-1 py-0.5">{android.sdkPath}</code>
              </>
            ) : (
              android.message ||
              translate(
                'auto.components.settings.MobileEmulatorSdkStatus.2784f0b22d',
                'Not found. Install Android Studio, then create a Virtual Device.'
              )
            )
          }
          actions={
            <>
              {!android.sdkFound ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void openStudio()}>
                  {translate(
                    'auto.components.settings.MobileEmulatorSdkStatus.b94ff260e6',
                    'Download Android Studio'
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => void handleLocate()}
                className={sdkPathActionClassName}
              >
                <FolderOpen className="size-3" />
                {translate(
                  'auto.components.settings.MobileEmulatorSdkStatus.18925b082d',
                  'Locate SDK folder'
                )}
              </Button>
              {configuredPath ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => void handleClear()}
                  className={sdkPathActionClassName}
                >
                  <X className="size-3" />
                  {translate(
                    'auto.components.settings.MobileEmulatorSdkStatus.8c52684db8',
                    'Clear'
                  )}
                </Button>
              ) : null}
            </>
          }
        />

        {showIos ? (
          <ToolchainStatusRow
            ok={iosOk}
            title={translate(
              'auto.components.settings.MobileEmulatorSdkStatus.76eb88b88e',
              'iOS Simulator (Xcode)'
            )}
            detail={
              iosOk
                ? translate('auto.components.settings.MobileEmulatorSdkStatus.c6f3ea4f12', 'Ready')
                : availability.simctl?.message ||
                  availability.serveSim?.message ||
                  translate(
                    'auto.components.settings.MobileEmulatorSdkStatus.e4f14b50d7',
                    'Install Xcode and add an iOS Simulator runtime.'
                  )
            }
          />
        ) : null}
      </div>
    </div>
  )
}
