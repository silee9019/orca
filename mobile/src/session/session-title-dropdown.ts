import { sortWorktrees } from '../worktree/workspace-list-ordering'
import type { Worktree } from '../worktree/workspace-list-sections'
import { worktreeSessionPath } from './mobile-session-route'

/** Rows in the host list's smart order, with the open session as the only highlighted one. */
export function sessionDropdownRows(worktrees: Worktree[], currentWorktreeId: string): Worktree[] {
  return sortWorktrees(
    worktrees.filter((w) => w.isArchived !== true),
    'smart'
  ).map((w) => ({ ...w, isActive: w.worktreeId === currentWorktreeId }))
}

export type DropdownSelection = { kind: 'close' } | { kind: 'switch'; href: string }

export function resolveDropdownSelection(args: {
  hostId: string
  currentWorktreeId: string
  item: Worktree
}): DropdownSelection {
  const { hostId, currentWorktreeId, item } = args
  if (item.worktreeId === currentWorktreeId) {
    return { kind: 'close' }
  }
  return {
    kind: 'switch',
    href: worktreeSessionPath(hostId, item.worktreeId, item.displayName || item.repo)
  }
}
