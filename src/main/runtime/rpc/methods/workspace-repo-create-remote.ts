import type { DesktopRepoCreateRemoteService } from '../../../repo-desktop-create-remote-handlers'
import { DesktopRepoCreateRemote } from '../../../../shared/rpc-contract/workspace-repo-create-remote-params'
import { defineMethod } from '../core'
let service: DesktopRepoCreateRemoteService | null = null
export function setDesktopRepoCreateRemoteForRpc(
  value: DesktopRepoCreateRemoteService | null
): void {
  service = value
}
export const WORKSPACE_REPO_CREATE_REMOTE_METHODS = [
  defineMethod({
    name: 'repo.createDesktopRemote',
    params: DesktopRepoCreateRemote,
    handler: async (params) => {
      if (!service) {
        throw new Error('runtime_unavailable')
      }
      try {
        const result = await service(params)
        if ('error' in result) {
          throw new Error('Desktop remote repository creation failed.')
        }
        return result
      } catch {
        throw new Error('Desktop remote repository creation failed.')
      }
    }
  })
]
