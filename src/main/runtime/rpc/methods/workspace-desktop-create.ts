import type { z } from 'zod'
import { DesktopWorktreeCreate } from '../../../../shared/rpc-contract/workspace-desktop-create-params'
import { defineMethod } from '../core'
import type { DesktopWorktreeCreateReceipt } from '../../../worktree-desktop-create-handlers'
type Create = (
  params: z.infer<typeof DesktopWorktreeCreate>
) => Promise<DesktopWorktreeCreateReceipt>
let create: Create | null = null
export function setDesktopWorktreeCreateForRpc(value: Create | null): void {
  create = value
}
export const WORKSPACE_DESKTOP_CREATE_METHODS = [
  defineMethod({
    name: 'worktree.createDesktop',
    params: DesktopWorktreeCreate,
    handler: async (params) => {
      if (!create) {
        throw new Error('runtime_unavailable')
      }
      return create(params)
    }
  })
]
