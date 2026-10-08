import { describe, expect, it, vi } from 'vitest'
import { RuntimeUsageController } from './runtime-usage-controller'

function store() {
  let enabled = false
  return {
    getScanState: () => ({ enabled }),
    setEnabled: (value: boolean) => ({ enabled: (enabled = value) }),
    refresh: vi.fn((force?: boolean) => ({ enabled, force })),
    getSnapshot: vi.fn((scope: string, range: string, limit?: number) => ({ scope, range, limit })),
    getSummary: vi.fn((scope: string, range: string) => ({ scope, range })),
    getDaily: vi.fn(() => ['daily']),
    getBreakdown: vi.fn(() => ['breakdown']),
    getRecentSessions: vi.fn(() => ['sessions'])
  }
}

describe('RuntimeUsageController', () => {
  it('updates only the selected provider and preserves query arguments', () => {
    const providers = { claude: store(), codex: store(), opencode: store(), muse: store() }
    const controller = new RuntimeUsageController(providers)
    expect(controller.setEnabled('codex', true)).toEqual({ enabled: true })
    expect(controller.getScanState('claude')).toEqual({ enabled: false })
    expect(controller.getSnapshot('codex', 'all', '7d', 4)).toEqual({
      scope: 'all',
      range: '7d',
      limit: 4
    })
    controller.refresh('muse', true)
    expect(providers.muse.refresh).toHaveBeenCalledWith(true)
    controller.getSummary('claude', 'orca', 'all')
    controller.getDaily('opencode', 'all', '30d')
    controller.getBreakdown('codex', 'orca', '90d', 'project')
    controller.getRecentSessions('muse', 'all', '7d', 2)
    expect(providers.claude.getSummary).toHaveBeenCalledWith('orca', 'all')
    expect(providers.opencode.getDaily).toHaveBeenCalledWith('all', '30d')
    expect(providers.codex.getBreakdown).toHaveBeenCalledWith('orca', '90d', 'project')
    expect(providers.muse.getRecentSessions).toHaveBeenCalledWith('all', '7d', 2)
  })
})
