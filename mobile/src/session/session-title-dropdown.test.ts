import { describe, expect, it } from 'vitest'
import type { Worktree } from '../worktree/workspace-list-sections'
import { worktreeSessionPath } from './mobile-session-route'
import { resolveDropdownSelection, sessionDropdownRows } from './session-title-dropdown'

function worktree(overrides: Partial<Worktree> & { worktreeId: string }): Worktree {
  return {
    repoId: 'repo-1',
    repo: 'orca',
    branch: 'refs/heads/main',
    displayName: overrides.worktreeId,
    path: `/tmp/${overrides.worktreeId}`,
    liveTerminalCount: 0,
    hasAttachedPty: false,
    preview: '',
    unread: false,
    isPinned: false,
    linkedPR: null,
    ...overrides
  }
}

describe('worktreeSessionPath', () => {
  it('encodes host, worktree and the display name', () => {
    expect(worktreeSessionPath('host/1', 'wt#1', 'my tree')).toBe(
      '/h/host%2F1/session/wt%231?name=my%20tree'
    )
  })
})

describe('sessionDropdownRows', () => {
  it('drops archived rows and marks only the open session as current', () => {
    const rows = sessionDropdownRows(
      [
        worktree({ worktreeId: 'a', isActive: true }),
        worktree({ worktreeId: 'b' }),
        worktree({ worktreeId: 'c', isArchived: true })
      ],
      'b'
    )
    expect(rows.map((row) => [row.worktreeId, row.isActive])).toEqual([
      ['a', false],
      ['b', true]
    ])
  })
})

describe('resolveDropdownSelection', () => {
  const current = worktree({ worktreeId: 'a', displayName: 'Alpha' })
  const other = worktree({ worktreeId: 'b', displayName: 'Beta' })

  it('only closes when the open session is picked', () => {
    expect(
      resolveDropdownSelection({ hostId: 'h', currentWorktreeId: 'a', item: current })
    ).toEqual({
      kind: 'close'
    })
  })

  it('switches to another session through the session route', () => {
    expect(resolveDropdownSelection({ hostId: 'h', currentWorktreeId: 'a', item: other })).toEqual({
      kind: 'switch',
      href: '/h/h/session/b?name=Beta'
    })
  })

  it('falls back to the repo name when the row has no display name', () => {
    const unnamed = worktree({ worktreeId: 'c', displayName: '', repo: 'orca' })
    expect(
      resolveDropdownSelection({ hostId: 'h', currentWorktreeId: 'a', item: unnamed })
    ).toEqual({
      kind: 'switch',
      href: '/h/h/session/c?name=orca'
    })
  })
})
