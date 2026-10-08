import { setProfileServicesForRpc } from '../runtime/rpc/methods/orca-profiles'
import {
  switchManagedProfile,
  transferManagedProfileProject
} from '../orca-profiles/profile-command-mutations'
import { app, ipcMain, type WebContents } from 'electron'
import type { Store } from '../persistence'
import { relaunchApp, type AppRelaunchReason } from '../app-relaunch'
import type {
  CreateLocalOrcaProfileArgs,
  CreateLocalOrcaProfileResult,
  CreateCloudLinkedOrcaProfileArgs,
  CreateCloudLinkedOrcaProfileResult,
  FindOrcaProfileProjectsByPathArgs,
  FindOrcaProfileProjectsByPathResult,
  OrcaProfileListResult,
  RefreshCurrentOrcaProfileAuthResult,
  SwitchOrcaProfileArgs,
  SwitchOrcaProfileResult,
  TransferOrcaProfileProjectArgs,
  TransferOrcaProfileProjectResult,
  ConnectCurrentOrcaProfileResult,
  OrcaProfileAuthStatus,
  SelectOrcaProfileOrgArgs,
  SelectOrcaProfileOrgResult,
  SignOutCurrentOrcaProfileResult
} from '../../shared/orca-profiles'
import {
  createLocalOrcaProfile,
  getOrcaProfileListState,
  seedNewOrcaProfileTelemetryConsent
} from '../orca-profiles/profile-index-store'
import { getProfileUserDataPath } from '../orca-profiles/profile-storage-paths'
import { isMultiProfileUiEnabled } from '../orca-profiles/profile-ui-scope'
import { findOrcaProfileProjectsByPath } from '../orca-profiles/profile-project-presence'
import { normalizeExecutionHostId } from '../../shared/execution-host'
import {
  createCloudLinkedOrcaProfile,
  connectCurrentOrcaProfile,
  getCurrentOrcaProfileAuthStatus,
  refreshCurrentOrcaProfileAuth,
  selectCurrentOrcaProfileOrg,
  signOutCurrentOrcaProfile
} from '../orca-profiles/profile-cloud-service'
import { registerOrcaProfileOrgMemberHandlers } from './orca-profile-org-members-handlers'
import { onOrcaCloudSessionInvalidated } from '../orca-profiles/profile-cloud-session-invalidation'
import { broadcastOrcaProfileAuthStatusChanged } from './orca-profile-auth-status-broadcast'
import { transferProjectArgsFromUnknown } from './orca-profile-project-transfer-args'

type RegisterOrcaProfileHandlersOptions = {
  onBeforeRelaunch?: () => void | Promise<void>
  onAuthMutation?: () => void
  onBeforeSignOut?: () => void
}

function profileIdFromArgs(args: unknown): string {
  const profileId =
    args && typeof args === 'object' && 'profileId' in args && typeof args.profileId === 'string'
      ? args.profileId.trim()
      : ''
  if (!profileId) {
    throw new Error('invalid_orca_profile_id')
  }
  return profileId
}

function findProjectsByPathArgsFromUnknown(args: unknown): FindOrcaProfileProjectsByPathArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_orca_profile_project_path')
  }
  const candidate = args as FindOrcaProfileProjectsByPathArgs
  const path = typeof candidate.path === 'string' ? candidate.path.trim() : ''
  if (!path) {
    throw new Error('invalid_orca_profile_project_path')
  }
  let executionHostId: FindOrcaProfileProjectsByPathArgs['executionHostId'] = null
  if (candidate.executionHostId !== null && candidate.executionHostId !== undefined) {
    if (typeof candidate.executionHostId !== 'string') {
      throw new Error('invalid_orca_profile_project_path')
    }
    executionHostId = normalizeExecutionHostId(candidate.executionHostId)
    if (!executionHostId) {
      throw new Error('invalid_orca_profile_project_path')
    }
  }
  return {
    path,
    connectionId:
      typeof candidate.connectionId === 'string' ? candidate.connectionId.trim() || null : null,
    executionHostId,
    excludeProfileId:
      typeof candidate.excludeProfileId === 'string'
        ? candidate.excludeProfileId.trim() || null
        : null
  }
}

function orgIdFromUnknown(args: unknown): string {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_orca_profile_org_selection')
  }
  const orgId = (args as SelectOrcaProfileOrgArgs).orgId?.trim()
  if (!orgId) {
    throw new Error('invalid_orca_profile_org_selection')
  }
  return orgId
}

function createCloudLinkedProfileArgsFromUnknown(args: unknown): CreateCloudLinkedOrcaProfileArgs {
  if (!args || typeof args !== 'object') {
    return {}
  }
  const candidate = args as CreateCloudLinkedOrcaProfileArgs
  const orgId = typeof candidate.orgId === 'string' ? candidate.orgId.trim() : undefined
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : undefined
  return {
    ...(orgId ? { orgId } : {}),
    ...(name ? { name } : {})
  }
}

async function runBeforeProfileRelaunch(
  onBeforeRelaunch?: () => void | Promise<void>
): Promise<void> {
  try {
    await onBeforeRelaunch?.()
  } catch (error) {
    console.warn(
      '[orca-profiles] Pre-relaunch cleanup failed; continuing profile switch:',
      error instanceof Error ? error.name : typeof error
    )
  }
}

type ProfileRelaunchReason = Extract<AppRelaunchReason, `profile-${string}`>

function scheduleProfileRelaunch(reason: ProfileRelaunchReason, sender?: WebContents): void {
  if (sender && !sender.isDestroyed()) {
    sender.send('app:restart-committed')
  }
  setTimeout(() => {
    relaunchApp(reason)
    // Why: app.quit() (not app.exit) so before-quit/will-quit still run —
    // renderer scrollback capture, PTY kill, stats flush, and daemon final
    // checkpoints must not be skipped on a profile switch.
    app.quit()
  }, 150)
}

export function registerOrcaProfileHandlers(
  store: Store,
  options: RegisterOrcaProfileHandlersOptions = {}
): void {
  setProfileServicesForRpc({
    store,
    beforeRelaunch: () => runBeforeProfileRelaunch(options.onBeforeRelaunch),
    scheduleRelaunch: (reason) => scheduleProfileRelaunch(reason),
    onAuthMutation: options.onAuthMutation,
    onBeforeSignOut: options.onBeforeSignOut
  })
  ipcMain.handle('orcaProfiles:list', (): OrcaProfileListResult => ({
    ...getOrcaProfileListState(),
    multiProfileUi: isMultiProfileUiEnabled()
  }))

  ipcMain.handle('orcaProfiles:authStatus', (): OrcaProfileAuthStatus =>
    getCurrentOrcaProfileAuthStatus(getProfileUserDataPath())
  )

  // Why: a background refresh can revoke the session with no renderer request in
  // flight, so push the change instead of waiting for the next pane to ask.
  // Why not options.onAuthMutation: that hook drives the relay coordinator, which
  // is the caller that just failed the refresh — re-entering it here would be a loop.
  onOrcaCloudSessionInvalidated(broadcastOrcaProfileAuthStatusChanged)

  ipcMain.handle(
    'orcaProfiles:createLocal',
    (_event, args?: CreateLocalOrcaProfileArgs): CreateLocalOrcaProfileResult => {
      const result = createLocalOrcaProfile(args)
      seedNewOrcaProfileTelemetryConsent(result.profile.id, store.getSettings().telemetry)
      return result
    }
  )

  ipcMain.handle(
    'orcaProfiles:switch',
    async (event, args: SwitchOrcaProfileArgs): Promise<SwitchOrcaProfileResult> => {
      const profileId = profileIdFromArgs(args)
      return switchManagedProfile(store, profileId, {
        before: () => runBeforeProfileRelaunch(options.onBeforeRelaunch),
        schedule: (reason) => scheduleProfileRelaunch(reason, event.sender)
      })
    }
  )

  ipcMain.handle(
    'orcaProfiles:transferProject',
    async (
      event,
      rawArgs: TransferOrcaProfileProjectArgs
    ): Promise<TransferOrcaProfileProjectResult> => {
      const args = transferProjectArgsFromUnknown(rawArgs)
      return transferManagedProfileProject(store, args, {
        before: () => runBeforeProfileRelaunch(options.onBeforeRelaunch),
        schedule: (reason) => scheduleProfileRelaunch(reason, event.sender)
      })
    }
  )

  ipcMain.handle(
    'orcaProfiles:findProjectProfiles',
    (_event, rawArgs: FindOrcaProfileProjectsByPathArgs): FindOrcaProfileProjectsByPathResult =>
      findOrcaProfileProjectsByPath(
        findProjectsByPathArgsFromUnknown(rawArgs),
        getProfileUserDataPath()
      )
  )

  ipcMain.handle(
    'orcaProfiles:connectCurrent',
    async (): Promise<ConnectCurrentOrcaProfileResult> => {
      const result = await connectCurrentOrcaProfile(getProfileUserDataPath())
      if (result.status === 'connected') {
        options.onAuthMutation?.()
      }
      return result
    }
  )

  ipcMain.handle(
    'orcaProfiles:createCloudLinked',
    async (
      _event,
      rawArgs?: CreateCloudLinkedOrcaProfileArgs
    ): Promise<CreateCloudLinkedOrcaProfileResult> => {
      const result = await createCloudLinkedOrcaProfile(
        getProfileUserDataPath(),
        createCloudLinkedProfileArgsFromUnknown(rawArgs)
      )
      if (result.status === 'created') {
        seedNewOrcaProfileTelemetryConsent(result.profile.id, store.getSettings().telemetry)
        options.onAuthMutation?.()
      }
      return result
    }
  )

  ipcMain.handle(
    'orcaProfiles:refreshAuth',
    async (): Promise<RefreshCurrentOrcaProfileAuthResult> => {
      const result = await refreshCurrentOrcaProfileAuth(getProfileUserDataPath())
      if (result.status === 'refreshed') {
        options.onAuthMutation?.()
      }
      return result
    }
  )

  ipcMain.handle(
    'orcaProfiles:signOutCurrent',
    async (): Promise<SignOutCurrentOrcaProfileResult> => {
      options.onBeforeSignOut?.()
      return signOutCurrentOrcaProfile(getProfileUserDataPath())
    }
  )

  ipcMain.handle(
    'orcaProfiles:selectOrg',
    async (_event, rawArgs: SelectOrcaProfileOrgArgs): Promise<SelectOrcaProfileOrgResult> => {
      const result = await selectCurrentOrcaProfileOrg(
        getProfileUserDataPath(),
        orgIdFromUnknown(rawArgs)
      )
      if (result.status === 'selected') {
        options.onAuthMutation?.()
      }
      return result
    }
  )

  registerOrcaProfileOrgMemberHandlers()
}
