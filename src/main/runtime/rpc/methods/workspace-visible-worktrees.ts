import type { z } from 'zod'
import type { Worktree } from '../../../../shared/worktree/types'
import { DesktopVisibleWorktrees } from '../../../../shared/rpc-contract/workspace-visible-worktree-params'
import { defineMethod } from '../core'

type DesktopVisibleWorktreeCatalog = {
  list: (params: z.infer<typeof DesktopVisibleWorktrees>) => Promise<Worktree[]>
  listAll: () => Promise<Worktree[]>
}
let desktopCatalog: DesktopVisibleWorktreeCatalog | null = null

export function setDesktopVisibleWorktreeCatalogForRpc(
  catalog: DesktopVisibleWorktreeCatalog | null
): void {
  desktopCatalog = catalog
}

function requireDesktopCatalog(): DesktopVisibleWorktreeCatalog {
  if (!desktopCatalog) {
    throw new Error('runtime_unavailable')
  }
  return desktopCatalog
}

export const WORKSPACE_VISIBLE_WORKTREE_METHODS = [
  defineMethod({
    name: 'worktree.listVisible',
    params: DesktopVisibleWorktrees,
    handler: (params) => requireDesktopCatalog().list(params)
  }),
  defineMethod({
    name: 'worktree.listAllVisible',
    params: null,
    handler: () => requireDesktopCatalog().listAll()
  })
]
