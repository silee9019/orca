import type { z } from 'zod'
import { DesktopRepoUpdate } from '../../../../shared/rpc-contract/workspace-repo-update-params'
import { defineMethod } from '../core'

type UpdateRepo = (params: z.infer<typeof DesktopRepoUpdate>) => Promise<void>
let updateRepo: UpdateRepo | null = null

export function setDesktopRepoUpdateForRpc(update: UpdateRepo | null): void {
  updateRepo = update
}

export const WORKSPACE_REPO_UPDATE_METHODS = [
  defineMethod({
    name: 'repo.updateDesktop',
    params: DesktopRepoUpdate,
    handler: async (params) => {
      if (!updateRepo) {
        throw new Error('runtime_unavailable')
      }
      await updateRepo(params)
      return { updated: true, repoId: params.repoId, hostId: params.hostId }
    }
  })
]
