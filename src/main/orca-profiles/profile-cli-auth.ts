import { randomUUID } from 'node:crypto'
import type { ConnectCurrentOrcaProfileResult } from '../../shared/orca-profiles'
import { connectCurrentOrcaProfile } from './profile-cloud-service'

type AuthOperation = {
  operationId: string
  profileId: string
  status: 'pending' | 'complete' | 'cancelled' | 'failed'
  authorizationUrl?: string
  result?: ConnectCurrentOrcaProfileResult
}

export class ProfileCliAuth {
  constructor(private readonly onConnected: () => void = () => {}) {}

  private current: { state: AuthOperation; controller: AbortController } | null = null

  start(userDataPath: string, profileId: string): AuthOperation {
    if (this.current?.state.status === 'pending') {
      throw new Error('Profile authentication is already pending')
    }
    const controller = new AbortController()
    const state: AuthOperation = { operationId: randomUUID(), profileId, status: 'pending' }
    this.current = { state, controller }
    void connectCurrentOrcaProfile(userDataPath, {
      signal: controller.signal,
      authorize: async (url) => {
        state.authorizationUrl = url
      }
    }).then(
      (result) => {
        state.result =
          result.status === 'failed'
            ? { ...result, error: 'Profile authentication failed' }
            : result
        if (result.status === 'connected') {
          this.onConnected()
        }
        state.status =
          result.status === 'cancelled'
            ? 'cancelled'
            : result.status === 'failed'
              ? 'failed'
              : 'complete'
        delete state.authorizationUrl
      },
      () => {
        state.status = 'failed'
        delete state.authorizationUrl
      }
    )
    return { ...state }
  }

  status(operationId: string): AuthOperation {
    if (this.current?.state.operationId !== operationId) {
      throw new Error('Profile auth operation not found')
    }
    return { ...this.current.state }
  }

  cancel(operationId: string): AuthOperation {
    this.status(operationId)
    const current = this.current
    if (!current) {
      throw new Error('Profile auth operation not found')
    }
    current.controller.abort()
    return { ...current.state }
  }
}
