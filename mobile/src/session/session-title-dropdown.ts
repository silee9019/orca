import { sortWorktrees } from '../worktree/workspace-list-ordering'
import { isWorktreePinned, type Worktree } from '../worktree/workspace-list-sections'
import { worktreeSessionPath } from './mobile-session-route'

export type DropdownEntry =
  | { kind: 'row'; item: Worktree; pinned: boolean; current: boolean }
  | { kind: 'divider' }

/**
 * A flat list: pinned sessions first, then the rest, each in the host list's smart order, with one
 * divider only when both groups have rows. Lineage is ignored, so a child never inherits its
 * parent's pin and nothing is nested.
 */
export function sessionDropdownEntries(
  worktrees: Worktree[],
  currentWorktreeId: string,
  localPins: Set<string>
): DropdownEntry[] {
  const unique = [...new Map(worktrees.map((w) => [w.worktreeId, w])).values()]
  const sorted = sortWorktrees(
    unique.filter((w) => w.isArchived !== true),
    'smart'
  )
  const toRow = (item: Worktree, pinned: boolean): DropdownEntry => ({
    kind: 'row',
    item,
    pinned,
    current: item.worktreeId === currentWorktreeId
  })
  const pinned = sorted.filter((w) => isWorktreePinned(w, localPins))
  const rest = sorted.filter((w) => !isWorktreePinned(w, localPins))
  return [
    ...pinned.map((w) => toRow(w, true)),
    ...(pinned.length > 0 && rest.length > 0 ? [{ kind: 'divider' as const }] : []),
    ...rest.map((w) => toRow(w, false))
  ]
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
