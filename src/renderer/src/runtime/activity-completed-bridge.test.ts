import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
import {
  makeRepo,
  makeTabWithIds,
  makeWorktree
} from '@/components/activity/ActivityPrototypePage-test-fixtures'
import {
  bumpProviderRuntimeSessionGeneration,
  getProviderRuntimeContextKey
} from '@/lib/provider-runtime-context'
import { applyActivityViewerRequest } from './activity-viewer-bridge'
import { readActivityScope } from './activity-scope-preferences'

const fixture = vi.hoisted(() => {
  const threads: AgentPaneThread[] = []
  return {
    mounted: true,
    available: true,
    query: '',
    threads,
    run: vi.fn(),
    state: {
      persistedUIReady: true,
      settings: { activeRuntimeEnvironmentId: null },
      agentsGroupBy: 'none',
      agentsReadFilter: 'all',
      agentsCompactMode: false,
      agentsShowChildAgents: true,
      agentsVisibleHostIds: null,
      agentsFilterRepoIds: [],
      agentsHideWorkspacesFromOtherDevices: false,
      agentsHideAutomationGeneratedWorkspaces: false,
      agentsHideCliCreatedWorkspaces: false
    }
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('./activity-viewer-view', () => ({
  readActivityCompletedControl: () =>
    fixture.available
      ? {
          allThreads: fixture.threads,
          visibleThreads: fixture.threads,
          run: fixture.run,
          hasCompletedThreads: fixture.threads.length > 0
        }
      : null,
  readActivityViewerView: (surface: string) =>
    fixture.mounted
      ? {
          surface,
          runtimeContextKey: getProviderRuntimeContextKey(fixture.state.settings),
          scope: readActivityScope(fixture.state),
          groupBy: fixture.state.agentsGroupBy,
          readFilter: fixture.state.agentsReadFilter,
          compact: false,
          showChildAgents: true,
          selectedPaneKey: null,
          querySettled: true,
          query: fixture.query,
          densityMeasured: false,
          logicalRows: [],
          renderedRows: []
        }
      : null
}))
const request = (expiresAt = Date.now() + 120) =>
  applyActivityViewerRequest({
    id: 'completed',
    expiresAt,
    command: { viewer: 'host', surface: 'activity-page', operation: 'clear-completed' }
  })
beforeEach(() => {
  const worktree = makeWorktree()
  fixture.threads = [
    {
      paneKey: 'a',
      unread: true,
      worktree,
      repo: makeRepo(),
      tab: makeTabWithIds('tab', worktree.id),
      paneTitle: 'a',
      agentType: 'claude',
      currentAgentState: null,
      currentAgentEntry: null,
      responsePreview: '',
      latestTimestamp: 1,
      latestEvent: null,
      events: []
    }
  ]
  Object.assign(fixture, {
    mounted: true,
    available: true,
    query: '',
    run: vi.fn()
  })
  fixture.state.agentsHideCliCreatedWorkspaces = false
  fixture.run.mockImplementation(() => {
    queueMicrotask(() => {
      fixture.threads = []
    })
  })
  vi.stubGlobal('window', { api: { ui: { get: vi.fn(), set: vi.fn() } } })
})
afterEach(() => vi.unstubAllGlobals())
it('waits for committed thread removal and never claims durable persistence', async () => {
  expect(await request()).toMatchObject({
    applied: true,
    dispatched: true,
    persisted: null,
    writeOutcome: 'not_requested',
    completedAction: { paneKeys: ['a'], remainingPaneKeys: [] }
  })
  expect(fixture.run).toHaveBeenCalledTimes(1)
  expect(window.api.ui.get).not.toHaveBeenCalled()
})
it('rejects expired, unmounted and unavailable controls before invoking the original callback', async () => {
  await expect(request(Date.now() - 1)).rejects.toThrow('request_expired')
  fixture.mounted = false
  await expect(request()).rejects.toThrow('activity_surface_unavailable')
  fixture.mounted = true
  fixture.available = false
  await expect(request()).rejects.toThrow('activity_completed_control_unavailable')
  expect(fixture.run).not.toHaveBeenCalled()
})
it.each(['query', 'scope', 'callback', 'unmount', 'session'])(
  'fences %s changes without replaying the original action',
  async (change) => {
    const original = fixture.run
    original.mockImplementation(() => {
      if (change === 'query') {
        fixture.query = 'changed'
      }
      if (change === 'scope') {
        queueMicrotask(() => {
          fixture.state.agentsHideCliCreatedWorkspaces = true
        })
      }
      if (change === 'callback') {
        fixture.run = vi.fn()
      }

      if (change === 'unmount') {
        fixture.mounted = false
      }
      if (change === 'session') {
        bumpProviderRuntimeSessionGeneration()
      }
    })
    expect(await request()).toMatchObject({
      applied: false,
      dispatched: true,
      persisted: null,
      reason: change === 'session' ? 'viewer_runtime_changed' : 'viewer_surface_superseded'
    })
    expect(original).toHaveBeenCalledTimes(1)
  }
)
it('does not report a newer thread turn as the cleared turn', async () => {
  fixture.run.mockImplementation(() => {
    fixture.threads = fixture.threads.map((thread) => ({
      ...thread,
      unread: false,
      latestTimestamp: 2
    }))
  })
  expect(await request()).toMatchObject({ applied: false, reason: 'viewer_not_applied' })
})
