import { describe, expect, it, vi } from 'vitest'
import { applyUsageViewerFilters, type UsageViewerFilterState } from './usage-viewer-filters'
import type { ClaudeUsageRange, ClaudeUsageScope } from '../../../shared/claude-usage-types'

function fixture() {
  const state: UsageViewerFilterState = {
    claudeUsageScope: 'orca',
    claudeUsageRange: '30d',
    codexUsageScope: 'orca',
    codexUsageRange: '30d',
    openCodeUsageScope: 'orca',
    openCodeUsageRange: '30d',
    museUsageScope: 'orca',
    museUsageRange: '30d',
    setClaudeUsageScope: vi.fn(async (scope: ClaudeUsageScope) => {
      state.claudeUsageScope = scope
    }),
    setClaudeUsageRange: vi.fn(async (range: ClaudeUsageRange) => {
      state.claudeUsageRange = range
    }),
    setCodexUsageScope: vi.fn(async (scope: ClaudeUsageScope) => {
      state.codexUsageScope = scope
    }),
    setCodexUsageRange: vi.fn(async (range: ClaudeUsageRange) => {
      state.codexUsageRange = range
    }),
    setOpenCodeUsageScope: vi.fn(async (scope: ClaudeUsageScope) => {
      state.openCodeUsageScope = scope
    }),
    setOpenCodeUsageRange: vi.fn(async (range: ClaudeUsageRange) => {
      state.openCodeUsageRange = range
    }),
    setMuseUsageScope: vi.fn(async (scope: ClaudeUsageScope) => {
      state.museUsageScope = scope
    }),
    setMuseUsageRange: vi.fn(async (range: ClaudeUsageRange) => {
      state.museUsageRange = range
    })
  }
  return state
}

describe('usage viewer filters', () => {
  it.each(['claude', 'codex', 'opencode', 'muse'])(
    'uses existing %s viewer setters and returns their selected filters',
    async (provider) => {
      const state = fixture()
      await expect(
        applyUsageViewerFilters({ provider, scope: 'all', range: '7d' }, () => state)
      ).resolves.toEqual({ provider, scope: 'all', range: '7d' })
      const scopes = [
        state.claudeUsageScope,
        state.codexUsageScope,
        state.openCodeUsageScope,
        state.museUsageScope
      ]
      expect(scopes.filter((scope) => scope === 'all')).toHaveLength(1)
    }
  )
  it('rejects malformed filters without changing any viewer state', async () => {
    const state = fixture()
    await expect(
      applyUsageViewerFilters({ provider: 'claude', scope: 'other' }, () => state)
    ).rejects.toThrow()
    await expect(applyUsageViewerFilters({ provider: 'claude' }, () => state)).rejects.toThrow()
    expect(state.claudeUsageScope).toBe('orca')
    expect(state.setClaudeUsageScope).not.toHaveBeenCalled()
  })
})
