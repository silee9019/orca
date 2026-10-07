import type { ConnectCurrentOrcaProfileResult } from '../../shared/orca-profiles'
import {
  connectCurrentOrcaProfile,
  getCurrentOrcaProfileAuthStatus,
  refreshCurrentOrcaProfileAuth,
  selectCurrentOrcaProfileOrg,
  signOutCurrentOrcaProfile
} from './profile-cloud-service'

export type ProfileAuthControlOptions = {
  userDataPath: string
  onAuthMutation?: () => void
  onBeforeSignOut?: () => void
}

export class ProfileAuthControls {
  private pending: AbortController | null = null
  private outcome: ConnectCurrentOrcaProfileResult['status'] | null = null

  constructor(private readonly options: ProfileAuthControlOptions) {}

  status() {
    return {
      phase: this.pending
        ? this.pending.signal.aborted
          ? 'cancelling'
          : 'pending'
        : this.outcome
          ? 'finished'
          : 'idle',
      outcome: this.outcome,
      auth: getCurrentOrcaProfileAuthStatus(this.options.userDataPath)
    }
  }

  start() {
    if (this.pending) {
      throw new Error(
        'An Orca profile login is already pending. Cancel it before starting another.'
      )
    }
    const pending = new AbortController()
    this.pending = pending
    this.outcome = null
    void connectCurrentOrcaProfile(this.options.userDataPath, { signal: pending.signal })
      .then((result) => {
        this.outcome = result.status
        if (result.status === 'connected') {
          this.options.onAuthMutation?.()
        }
      })
      .catch(() => {
        this.outcome = 'failed'
      })
      .finally(() => {
        if (this.pending === pending) {
          this.pending = null
        }
      })
    return this.status()
  }

  cancel() {
    this.pending?.abort()
    return this.status()
  }

  async signOut() {
    this.pending?.abort()
    this.options.onBeforeSignOut?.()
    return signOutCurrentOrcaProfile(this.options.userDataPath)
  }

  async refresh() {
    const result = await refreshCurrentOrcaProfileAuth(this.options.userDataPath)
    if (result.status === 'refreshed') {
      this.options.onAuthMutation?.()
    }
    return result
  }

  async selectOrg(orgId: string) {
    const result = await selectCurrentOrcaProfileOrg(this.options.userDataPath, orgId)
    if (result.status === 'selected') {
      this.options.onAuthMutation?.()
    }
    return result
  }
}
