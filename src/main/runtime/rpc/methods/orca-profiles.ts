import { defineMethod } from '../core'
import type { Store } from '../../../persistence'
import { ProfileCliAuth } from '../../../orca-profiles/profile-cli-auth'
import {
  getOrcaProfileListState,
  createLocalOrcaProfile,
  seedNewOrcaProfileTelemetryConsent
} from '../../../orca-profiles/profile-index-store'
import { getProfileUserDataPath } from '../../../orca-profiles/profile-storage-paths'
import { isMultiProfileUiEnabled } from '../../../orca-profiles/profile-ui-scope'
import {
  getCurrentOrcaProfileAuthStatus,
  createCloudLinkedOrcaProfile,
  refreshCurrentOrcaProfileAuth,
  signOutCurrentOrcaProfile,
  selectCurrentOrcaProfileOrg
} from '../../../orca-profiles/profile-cloud-service'
import { findOrcaProfileProjectsByPath } from '../../../orca-profiles/profile-project-presence'
import {
  switchManagedProfile,
  transferManagedProfileProject
} from '../../../orca-profiles/profile-command-mutations'
import {
  listOrcaProfileOrgMembers,
  inviteOrcaProfileOrgMember,
  revokeOrcaProfileOrgInvite,
  changeOrcaProfileOrgMemberRole,
  removeOrcaProfileOrgMember
} from '../../../orca-profiles/profile-cloud-org-members-service'
import {
  ProfileCreateParams,
  ProfileCloudCreateParams,
  ProfileUseParams,
  ProfileTransferParams,
  ProfileFindProjectsParams,
  ProfileOrgParams,
  ProfileOrgInviteParams,
  ProfileOrgRevokeParams,
  ProfileOrgRemoveParams,
  ProfileOrgRoleParams,
  ProfileCurrentParams,
  ProfileAuthOperationParams
} from '../../../../shared/rpc-contract/orca-profile-params'

type ProfileServices = {
  store: Store
  beforeRelaunch: () => Promise<void>
  scheduleRelaunch: (reason: 'profile-switch' | 'profile-transfer') => void
  onAuthMutation?: () => void
  onBeforeSignOut?: () => void
}
let services: ProfileServices | null = null
const auth = new ProfileCliAuth(() => services?.onAuthMutation?.())
export function setProfileServicesForRpc(value: ProfileServices | null): void {
  services = value
}
function requireServices(): ProfileServices {
  if (!services) {
    throw new Error('Profile management is not available on this runtime')
  }
  return services
}
function assertCurrent(profileId: string): void {
  requireServices()
  if (getOrcaProfileListState().activeProfileId !== profileId) {
    throw new Error('Active profile changed; inspect profile list and retry')
  }
}
const path = (): string => {
  requireServices()
  return getProfileUserDataPath()
}
const relaunch = () => ({
  before: requireServices().beforeRelaunch,
  schedule: requireServices().scheduleRelaunch
})

export const ORCA_PROFILE_METHODS = [
  defineMethod({
    name: 'profile.list',
    params: null,
    handler: () => {
      path()
      return { ...getOrcaProfileListState(), multiProfileUi: isMultiProfileUiEnabled() }
    }
  }),
  defineMethod({
    name: 'profile.authStatus',
    params: null,
    handler: () => getCurrentOrcaProfileAuthStatus(path())
  }),
  defineMethod({
    name: 'profile.createLocal',
    params: ProfileCreateParams,
    handler: (params) => {
      const s = requireServices()
      const result = createLocalOrcaProfile(params)
      seedNewOrcaProfileTelemetryConsent(result.profile.id, s.store.getSettings().telemetry)
      return result
    }
  }),
  defineMethod({
    name: 'profile.createCloudLinked',
    params: ProfileCloudCreateParams,
    handler: async (params) => {
      const result = await createCloudLinkedOrcaProfile(path(), params)
      if (result.status === 'created') {
        seedNewOrcaProfileTelemetryConsent(
          result.profile.id,
          requireServices().store.getSettings().telemetry
        )
        requireServices().onAuthMutation?.()
      }
      return result
    }
  }),
  defineMethod({
    name: 'profile.use',
    params: ProfileUseParams,
    handler: (params) => {
      assertCurrent(params.currentProfileId)
      return switchManagedProfile(requireServices().store, params.profileId, relaunch())
    }
  }),
  defineMethod({
    name: 'profile.transferProject',
    params: ProfileTransferParams,
    handler: (params) => {
      assertCurrent(params.currentProfileId)
      return transferManagedProfileProject(requireServices().store, params, relaunch())
    }
  }),
  defineMethod({
    name: 'profile.findProjects',
    params: ProfileFindProjectsParams,
    handler: (params) => findOrcaProfileProjectsByPath(params, path())
  }),
  defineMethod({
    name: 'profile.authStart',
    params: ProfileCurrentParams,
    handler: (params) => {
      assertCurrent(params.currentProfileId)
      return auth.start(path(), params.currentProfileId)
    }
  }),
  defineMethod({
    name: 'profile.authOperation',
    params: ProfileAuthOperationParams,
    handler: (params) => {
      path()
      return auth.status(params.operationId)
    }
  }),
  defineMethod({
    name: 'profile.authCancel',
    params: ProfileAuthOperationParams,
    handler: (params) => {
      path()
      return auth.cancel(params.operationId)
    }
  }),
  defineMethod({
    name: 'profile.refreshAuth',
    params: null,
    handler: async () => {
      const result = await refreshCurrentOrcaProfileAuth(path())
      if (result.status === 'refreshed') {
        requireServices().onAuthMutation?.()
      }
      return result
    }
  }),
  defineMethod({
    name: 'profile.signOut',
    params: ProfileCurrentParams,
    handler: (params) => {
      assertCurrent(params.currentProfileId)
      requireServices().onBeforeSignOut?.()
      return signOutCurrentOrcaProfile(path())
    }
  }),
  defineMethod({
    name: 'profile.selectOrg',
    params: ProfileOrgParams,
    handler: async (params) => {
      const result = await selectCurrentOrcaProfileOrg(path(), params.orgId)
      if (result.status === 'selected') {
        requireServices().onAuthMutation?.()
      }
      return result
    }
  }),
  defineMethod({
    name: 'profile.orgMembers',
    params: ProfileOrgParams,
    handler: (params) => listOrcaProfileOrgMembers(path(), params.orgId)
  }),
  defineMethod({
    name: 'profile.orgInvite',
    params: ProfileOrgInviteParams,
    handler: (params) => inviteOrcaProfileOrgMember(path(), params)
  }),
  defineMethod({
    name: 'profile.orgRevokeInvite',
    params: ProfileOrgRevokeParams,
    handler: (params) => revokeOrcaProfileOrgInvite(path(), params)
  }),
  defineMethod({
    name: 'profile.orgSetRole',
    params: ProfileOrgRoleParams,
    handler: (params) => changeOrcaProfileOrgMemberRole(path(), params)
  }),
  defineMethod({
    name: 'profile.orgRemoveMember',
    params: ProfileOrgRemoveParams,
    handler: (params) => removeOrcaProfileOrgMember(path(), params)
  })
]
