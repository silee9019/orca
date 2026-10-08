import type { z } from 'zod'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import { DesktopWorktreeLineageUpdate } from '../../../../shared/rpc-contract/workspace-lineage-params'
import { defineMethod } from '../core'

type UpdateLineage = (
  params: z.infer<typeof DesktopWorktreeLineageUpdate>
) => Promise<WorktreeLineage | null>
let updateLineage: UpdateLineage | null = null

export function setDesktopLineageForRpc(update: UpdateLineage | null): void {
  updateLineage = update
}

export const WORKSPACE_LINEAGE_METHODS = [
  defineMethod({
    name: 'worktree.updateDesktopLineage',
    params: DesktopWorktreeLineageUpdate,
    handler: async (params) => {
      if (!updateLineage) {
        throw new Error('runtime_unavailable')
      }
      const lineage = await updateLineage(params)
      return {
        updated: true,
        worktreeId: params.target.worktreeId,
        executionHostId: params.target.executionHostId,
        identityKey: params.target.identityKey,
        lineage
      }
    }
  })
]
