import type { z } from 'zod'
import { DesktopWorktreeMetaUpdate } from '../../../../shared/rpc-contract/workspace-desktop-meta-params'
import { defineMethod } from '../core'

type UpdateMetadata = (params: z.infer<typeof DesktopWorktreeMetaUpdate>) => Promise<void>
let updateMetadata: UpdateMetadata | null = null

export function setDesktopWorktreeMetadataForRpc(update: UpdateMetadata | null): void {
  updateMetadata = update
}

export const WORKSPACE_DESKTOP_META_METHODS = [
  defineMethod({
    name: 'worktree.updateDesktopMetadata',
    params: DesktopWorktreeMetaUpdate,
    handler: async (params) => {
      if (!updateMetadata) {
        throw new Error('runtime_unavailable')
      }
      await updateMetadata(params)
      return {
        updated: true,
        worktreeId: params.worktreeId,
        executionHostId: params.executionHostId
      }
    }
  })
]
