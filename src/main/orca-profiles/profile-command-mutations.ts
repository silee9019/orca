import type { Store } from '../persistence'
import type { TransferOrcaProfileProjectArgs } from '../../shared/orca-profiles'
import { getOrcaProfileListState, setActiveOrcaProfile } from './profile-index-store'
import {
  cloudSessionIdentity,
  recordCloudSessionIdentityMutation
} from './profile-cloud-session-mutation'
import { getProfileUserDataPath } from './profile-storage-paths'
import {
  flushActiveProfileBeforeFileMutation,
  flushActiveProfileBeforeRelaunch
} from './profile-persistence-deadline'
import { transferOrcaProfileProject } from './profile-project-transfer'
import { transferActiveProfileProject } from './profile-active-transfer'

type ProfileRelaunch = {
  before: () => Promise<void>
  schedule: (reason: 'profile-switch' | 'profile-transfer') => void
}

export async function switchManagedProfile(
  store: Store,
  profileId: string,
  relaunch: ProfileRelaunch
) {
  const current = getOrcaProfileListState()
  if (profileId === current.activeProfileId) {
    return { status: 'already-active' as const }
  }
  const active = current.profiles.find((profile) => profile.id === current.activeProfileId)
  if (active?.cloud) {
    recordCloudSessionIdentityMutation(
      cloudSessionIdentity(active.id, active.cloud),
      getProfileUserDataPath()
    )
  }
  await flushActiveProfileBeforeRelaunch(store)
  setActiveOrcaProfile(profileId)
  await relaunch.before()
  relaunch.schedule('profile-switch')
  return { status: 'relaunching' as const }
}

export async function transferManagedProfileProject(
  store: Store,
  args: TransferOrcaProfileProjectArgs,
  relaunch: ProfileRelaunch
) {
  const current = getOrcaProfileListState()
  if (args.targetProfileId === current.activeProfileId) {
    throw new Error('active_target_orca_profile_transfer_requires_relaunch')
  }
  if (args.mode === 'move' && args.sourceProfileId === current.activeProfileId) {
    const result = await transferActiveProfileProject(
      args,
      getProfileUserDataPath(),
      store,
      async () => {
        await relaunch.before()
        relaunch.schedule('profile-transfer')
      }
    )
    if (result.status === 'transferred') {
      await relaunch.before()
      try {
        setActiveOrcaProfile(args.targetProfileId)
      } finally {
        relaunch.schedule('profile-transfer')
      }
      return { ...result, willRelaunch: true }
    }
    return result
  }
  if (args.sourceProfileId !== current.activeProfileId) {
    await store.flushPendingOrThrowAsync({ drainToStableGeneration: false })
    return transferOrcaProfileProject(args, getProfileUserDataPath())
  }
  const maintenance = await flushActiveProfileBeforeFileMutation(store)
  try {
    return transferOrcaProfileProject(args, getProfileUserDataPath())
  } finally {
    await maintenance.resume()
  }
}
