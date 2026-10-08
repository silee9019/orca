import { createHash } from 'node:crypto'
import { defineMethod, InvalidArgumentError } from '../core'
import {
  DeveloperPermissionRequestParams,
  DeveloperPermissionSettingsParams,
  NotificationDismissParams,
  NotificationDispatchParams,
  NotificationProbeParams,
  NotificationSoundParams,
  OsPermissionConfirmedParams,
  OsPermissionEmptyParams,
  OsPermissionViewerParams,
  TccPromptClaimParams,
  TccPromptOwnerParams,
  TccPromptReleaseParams
} from '../../../../shared/rpc-contract/os-permissions-params'

function tccOwner(claimToken: string): number {
  // Renderer owners are positive handler ids; CLI capabilities occupy a negative namespace.
  return -1 - createHash('sha256').update(claimToken).digest().readUIntBE(0, 6)
}

async function controls() {
  const { getNotificationControls } = await import('../../../notifications/notification-controls')
  const service = getNotificationControls()
  if (!service) {
    throw new InvalidArgumentError('desktop_unavailable')
  }
  return service
}

export const OS_PERMISSION_METHODS = [
  defineMethod({
    name: 'notifications.playSound',
    params: NotificationSoundParams,
    handler: async ({ force, volume }, { signal }) =>
      (
        await import('../../../notifications/notification-sound-cli')
      ).requestDesktopNotificationSound({ force, volume }, signal)
  }),
  defineMethod({
    name: 'computer.permissionsReset',
    params: OsPermissionConfirmedParams,
    handler: async () =>
      (
        await import('../../../computer/macos-computer-use-permissions')
      ).resetComputerUsePermissions()
  }),
  defineMethod({
    name: 'developerPermissions.getStatus',
    params: OsPermissionEmptyParams,
    handler: async () =>
      (await import('../../../ipc/developer-permissions')).getDeveloperPermissionStatus()
  }),
  defineMethod({
    name: 'developerPermissions.request',
    params: DeveloperPermissionRequestParams,
    handler: async ({ id }) =>
      (await import('../../../ipc/developer-permissions')).requestPermission(id)
  }),
  defineMethod({
    name: 'developerPermissions.openSettings',
    params: DeveloperPermissionSettingsParams,
    handler: async ({ id }) => {
      if (process.platform !== 'darwin') {
        return { openedSystemSettings: false, status: 'unsupported' as const }
      }
      const openedSystemSettings = await (
        await import('../../../ipc/developer-permissions')
      ).openPrivacyPane(id)
      return { openedSystemSettings, status: 'awaiting-decision' as const }
    }
  }),
  defineMethod({
    name: 'pty.macTccAttribution',
    params: OsPermissionEmptyParams,
    handler: async () => (await import('../../../ipc/pty-management')).readDaemonMacTccAttribution()
  }),
  defineMethod({
    name: 'macosTccPrompts.getStatus',
    params: OsPermissionEmptyParams,
    handler: async () =>
      (await import('../../../macos-tcc-prompt-notice')).getTccPromptNoticeStatus()
  }),
  defineMethod({
    name: 'macosTccPrompts.consumePending',
    params: TccPromptOwnerParams,
    handler: async ({ claimToken }) =>
      (await import('../../../macos-tcc-prompt-notice')).consumePendingTccPromptNotice(
        tccOwner(claimToken)
      )
  }),
  defineMethod({
    name: 'macosTccPrompts.acknowledgePending',
    params: TccPromptClaimParams,
    handler: async ({ claimId, claimToken }) => ({
      acknowledged: (
        await import('../../../macos-tcc-prompt-notice')
      ).acknowledgePendingTccPromptClaim(tccOwner(claimToken), claimId)
    })
  }),
  defineMethod({
    name: 'macosTccPrompts.releasePending',
    params: TccPromptReleaseParams,
    handler: async ({ claimId, claimToken }) => ({
      released: (await import('../../../macos-tcc-prompt-notice')).releasePendingTccPromptClaim(
        tccOwner(claimToken),
        claimId
      )
    })
  }),
  defineMethod({
    name: 'macosTccPrompts.dismiss',
    params: OsPermissionConfirmedParams,
    handler: async () => {
      ;(await import('../../../macos-tcc-prompt-notice')).dismissTccPromptNotice()
      return { dismissed: true }
    }
  }),
  defineMethod({
    name: 'notifications.getPermissionStatus',
    params: OsPermissionViewerParams,
    handler: async () => (await controls()).getPermissionStatus()
  }),
  defineMethod({
    name: 'notifications.getDesktopAwayState',
    params: OsPermissionViewerParams,
    handler: async () => (await controls()).getDesktopAwayState()
  }),
  defineMethod({
    name: 'notifications.probeDelivery',
    params: NotificationProbeParams,
    handler: async ({ force }) => (await controls()).probeDelivery({ force })
  }),
  defineMethod({
    name: 'notifications.openSystemSettings',
    params: OsPermissionConfirmedParams,
    handler: async () => {
      const openedSystemSettings = await (await controls()).openSystemSettings()
      return {
        openedSystemSettings,
        status: openedSystemSettings ? ('awaiting-decision' as const) : ('unsupported' as const)
      }
    }
  }),
  defineMethod({
    name: 'notifications.dispatch',
    params: NotificationDispatchParams,
    handler: async ({ request }) => (await controls()).dispatch(request)
  }),
  defineMethod({
    name: 'notifications.dismiss',
    params: NotificationDismissParams,
    handler: async ({ ids, paneKeys }) => (await controls()).dismiss(ids, paneKeys)
  })
]
