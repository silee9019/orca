import type { ReactNode } from 'react'
import { toast } from 'sonner'
import type { AppState } from '@/store/types'
import { translate } from '@/i18n/i18n'

const MOBILE_EMULATOR_HIDDEN_TOAST_ID = 'mobile-emulator-hidden'
// Why: auto-dismiss the nudge after 30s so it can't linger forever; it stays
// dismissible early and the Settings re-enable link is reachable until then.
const MOBILE_EMULATOR_HIDDEN_TOAST_DURATION_MS = 30_000

type MobileEmulatorHiddenToastDeps = {
  openSettingsPage: AppState['openSettingsPage']
  openSettingsTarget: AppState['openSettingsTarget']
}

export function openMobileEmulatorHiddenToastSettings(
  deps: MobileEmulatorHiddenToastDeps,
  expectedDescription?: ReactNode
): boolean {
  const active = toast.getToasts().find((entry) => entry.id === MOBILE_EMULATOR_HIDDEN_TOAST_ID)
  if (
    !active ||
    (expectedDescription !== undefined &&
      (!('description' in active) || active.description !== expectedDescription))
  ) {
    return false
  }
  deps.openSettingsTarget({ pane: 'mobile-emulator', repoId: null })
  deps.openSettingsPage()
  toast.dismiss(MOBILE_EMULATOR_HIDDEN_TOAST_ID)
  return !toast.getToasts().some((entry) => entry.id === MOBILE_EMULATOR_HIDDEN_TOAST_ID)
}

export function showMobileEmulatorHiddenToast(deps: MobileEmulatorHiddenToastDeps): void {
  const description: ReactNode = (
    <p className="text-sm text-popover-foreground/80">
      {translate(
        'auto.components.emulator.pane.mobile.emulator.hidden.toast.c46c979c1d',
        'Re-enable Mobile Emulator anytime in'
      )}{' '}
      <button
        type="button"
        onClick={() => {
          openMobileEmulatorHiddenToastSettings(deps, description)
        }}
        className="cursor-pointer font-medium text-popover-foreground underline underline-offset-2 hover:text-primary"
      >
        {translate(
          'auto.components.emulator.pane.mobile.emulator.hidden.toast.600f9a745a',
          'Settings › Mobile Emulator'
        )}
      </button>
      .
    </p>
  )
  toast.info(
    translate(
      'auto.components.emulator.pane.mobile.emulator.hidden.toast.e8f098a870',
      'Mobile Emulator hidden'
    ),
    {
      id: MOBILE_EMULATOR_HIDDEN_TOAST_ID,
      description,
      duration: MOBILE_EMULATOR_HIDDEN_TOAST_DURATION_MS,
      dismissible: true
    }
  )
}
