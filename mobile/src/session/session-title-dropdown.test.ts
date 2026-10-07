import { describe, expect, it } from 'vitest'
import type { Worktree } from '../worktree/workspace-list-sections'
import { worktreeSessionPath } from './mobile-session-route'
import { resolveDropdownSelection, sessionDropdownEntries } from './session-title-dropdown'

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

describe('sessionDropdownEntries', () => {
  const ids = (entries: ReturnType<typeof sessionDropdownEntries>) =>
    entries.map((entry) => (entry.kind === 'divider' ? '---' : entry.item.worktreeId))

  it('lists pinned sessions first, one divider, then the rest', () => {
    const entries = sessionDropdownEntries(
      [
        worktree({ worktreeId: 'a', sortOrder: 3 }),
        worktree({ worktreeId: 'b', isPinned: true, sortOrder: 1 }),
        worktree({ worktreeId: 'c', sortOrder: 2 })
      ],
      'a',
      new Set()
    )
    expect(ids(entries)).toEqual(['b', '---', 'a', 'c'])
  })

  it('draws no divider when only one group has sessions', () => {
    const pinnedOnly = sessionDropdownEntries(
      [
        worktree({ worktreeId: 'a', isPinned: true }),
        worktree({ worktreeId: 'b', isPinned: true })
      ],
      'a',
      new Set()
    )
    expect(ids(pinnedOnly)).not.toContain('---')
    const unpinnedOnly = sessionDropdownEntries(
      [worktree({ worktreeId: 'a' }), worktree({ worktreeId: 'b' })],
      'a',
      new Set()
    )
    expect(ids(unpinnedOnly)).not.toContain('---')
    expect(sessionDropdownEntries([], 'a', new Set())).toEqual([])
  })

  it('pins from the host flag or the phone-side pin set, without duplicates', () => {
    const entries = sessionDropdownEntries(
      [
        worktree({ worktreeId: 'a' }),
        worktree({ worktreeId: 'b', isPinned: true }),
        worktree({ worktreeId: 'c' }),
        worktree({ worktreeId: 'c' })
      ],
      'a',
      new Set(['c', 'b'])
    )
    expect(ids(entries).sort()).toEqual(['---', 'a', 'b', 'c'])
    expect(
      entries
        .filter((e) => e.kind === 'row' && e.pinned)
        .map((e) => e.kind === 'row' && e.item.worktreeId)
        .sort()
    ).toEqual(['b', 'c'])
  })

  it('moves a session between the groups when it is pinned and unpinned', () => {
    const rows = [worktree({ worktreeId: 'a' }), worktree({ worktreeId: 'b' })]
    expect(ids(sessionDropdownEntries(rows, 'a', new Set(['b'])))).toEqual(['b', '---', 'a'])
    expect(ids(sessionDropdownEntries(rows, 'a', new Set()))).not.toContain('---')
  })

  it('is flat: children are not nested and do not inherit a parent pin', () => {
    const entries = sessionDropdownEntries(
      [
        worktree({ worktreeId: 'parent', isPinned: true, childWorktreeIds: ['child'] }),
        worktree({ worktreeId: 'child', parentWorktreeId: 'parent', lineageDepth: 1 }),
        worktree({ worktreeId: 'other', repo: 'second', repoId: 'repo-2' })
      ],
      'other',
      new Set()
    )
    expect(ids(entries)).toEqual(['parent', '---', 'child', 'other'])
  })

  it('drops archived rows and marks only the open session as current', () => {
    const entries = sessionDropdownEntries(
      [
        worktree({ worktreeId: 'a', isActive: true }),
        worktree({ worktreeId: 'b' }),
        worktree({ worktreeId: 'c', isArchived: true })
      ],
      'b',
      new Set()
    )
    expect(entries.map((e) => (e.kind === 'row' ? [e.item.worktreeId, e.current] : null))).toEqual([
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
