import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { DesktopRepoAddServices } from '../../../repo-desktop-add-handlers'
import {
  DesktopRepoAddLocal,
  DesktopRepoAddRemote
} from '../../../../shared/rpc-contract/workspace-repo-add-params'
import { defineMethod } from '../core'
let services: DesktopRepoAddServices | null = null
export function setDesktopRepoAddForRpc(value: DesktopRepoAddServices | null): void {
  services = value
}
function requireServices(): DesktopRepoAddServices {
  if (!services) {
    throw new Error('runtime_unavailable')
  }
  return services
}
export const WORKSPACE_REPO_ADD_METHODS = [
  defineMethod({
    name: 'repo.addDesktopLocal',
    params: DesktopRepoAddLocal,
    handler: async (params) => {
      const service = requireServices()
      if (!isAbsolute(params.path) || !(await stat(params.path).catch(() => null))?.isDirectory()) {
        throw new Error('Desktop repository path must be an existing absolute directory.')
      }
      const result = await service.addLocal(params)
      if ('error' in result) {
        throw new Error('Desktop repository registration failed.')
      }
      return result
    }
  }),
  defineMethod({
    name: 'repo.addDesktopRemote',
    params: DesktopRepoAddRemote,
    handler: async (params) => {
      const result = await requireServices().addRemote(params)
      if ('error' in result) {
        throw new Error('Desktop repository registration failed.')
      }
      return result
    }
  })
]
