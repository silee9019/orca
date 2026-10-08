import { defineMethod } from '../core'

let gitEnvironmentStartupBarrier: (() => Promise<void>) | null = null

export function setGitEnvironmentStartupBarrierForRpc(barrier: (() => Promise<void>) | null): void {
  gitEnvironmentStartupBarrier = barrier
}

export const WORKSPACE_GIT_STARTUP_METHODS = [
  defineMethod({
    name: 'git.awaitEnvironmentStartupBarrier',
    params: null,
    handler: async () => {
      if (!gitEnvironmentStartupBarrier) {
        throw new Error('runtime_unavailable')
      }
      await gitEnvironmentStartupBarrier()
      return { settled: true as const }
    }
  })
]
