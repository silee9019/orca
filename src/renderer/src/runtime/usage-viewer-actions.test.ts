import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  statusBarUsageMode: 'verbose',
  openSettingsTarget: vi.fn(),
  openSettingsPage: vi.fn(),
  setStatusBarUsageMode: vi.fn((mode: string) => {
    state.statusBarUsageMode = mode
  })
}))
vi.mock('../store', () => ({ useAppStore: { getState: () => state } }))
vi.mock('./usage-viewer-filters', () => ({
  applyUsageViewerFilters: vi.fn(async (input) => input)
}))
import { applyUsageViewerAction } from './usage-viewer-actions'
import { applyUsageViewerFilters } from './usage-viewer-filters'

describe('usage viewer action', () => {
  it('selects a provider and opens analytics through existing navigation actions', async () => {
    await expect(applyUsageViewerAction({ action: 'select-tab', tab: 'codex' })).resolves.toEqual({
      tab: 'codex'
    })
    expect(state.openSettingsTarget).toHaveBeenCalledExactlyOnceWith({
      pane: 'stats',
      repoId: null
    })
    expect(state.openSettingsPage).toHaveBeenCalledOnce()
  })
  it('applies existing viewer display setter and returns the observed mode', async () => {
    await expect(
      applyUsageViewerAction({ action: 'set-display-mode', mode: 'compact' })
    ).resolves.toEqual({ mode: 'compact', applied: 'viewer' })
    expect(state.setStatusBarUsageMode).toHaveBeenCalledExactlyOnceWith('compact')
  })
  it('delegates validated filters to the explicit provider adapter', async () => {
    await applyUsageViewerAction({ action: 'set-filters', provider: 'codex', scope: 'all' })
    expect(applyUsageViewerFilters).toHaveBeenCalledExactlyOnceWith(
      { provider: 'codex', scope: 'all', range: undefined },
      expect.any(Function)
    )
    await expect(applyUsageViewerAction({ action: 'select-tab', tab: 'invalid' })).rejects.toThrow()
  })
})
