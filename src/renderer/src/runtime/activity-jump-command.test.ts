import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
import {
  makeRepo,
  makeTab,
  makeWorktree
} from '@/components/activity/ActivityPrototypePage-test-fixtures'
import {
  bumpProviderRuntimeSessionGeneration,
  getProviderRuntimeContextKey
} from '@/lib/provider-runtime-context'
import { applyActivityViewerRequest } from './activity-viewer-bridge'

const fixture = vi.hoisted(() => {
  const threads: AgentPaneThread[] = []
  return {
    mounted: true,
    available: true,
    eligible: true,
    destination: false,
    host: 'local',
    settingsAvailable: true,
    threads,
    jump: vi.fn<(thread: AgentPaneThread) => boolean | void>(),
    listeners: new Set<() => void>(),
    state: {
      persistedUIReady: true,
      settings: { activeRuntimeEnvironmentId: null },
      activeView: 'activity',
      activeWorktreeId: '',
      agentsGroupBy: 'none',
      agentsReadFilter: 'all',
      agentsCompactMode: false,
      agentsShowChildAgents: true
    }
  }
})
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      ...fixture.state,
      settings: fixture.settingsAvailable ? fixture.state.settings : null
    }),
    subscribe: (listener: () => void) => {
      fixture.listeners.add(listener)
      return () => fixture.listeners.delete(listener)
    }
  }
}))
vi.mock('@/lib/resolved-worktree-execution-host', () => ({
  getResolvedExecutionHostIdForWorktree: () => fixture.host || null
}))
vi.mock('./activity-workspace-destination', () => ({
  readActivityWorkspaceDestination: () => fixture.destination
}))
vi.mock('./activity-viewer-view', () => ({
  readActivityViewerView: (surface: string) =>
    fixture.mounted
      ? {
          surface,
          runtimeContextKey: getProviderRuntimeContextKey(fixture.state.settings),
          querySettled: true
        }
      : null,
  readActivityNavigationControl: () =>
    fixture.available
      ? {
          visibleThreads: fixture.threads,
          jump: fixture.jump,
          canJump: () => fixture.eligible
        }
      : null
}))
const request = (expiresAt = Date.now() + 120, paneKey = 'pane') =>
  applyActivityViewerRequest({
    id: 'jump',
    expiresAt,
    command: { viewer: 'host', surface: 'activity-page', operation: 'jump', paneKey }
  })
function notify(): void {
  for (const listener of fixture.listeners) {
    listener()
  }
}
beforeEach(() => {
  fixture.threads = [
    {
      paneKey: 'pane',
      worktree: makeWorktree(),
      repo: makeRepo(),
      tab: makeTab(),
      paneTitle: '',
      agentType: 'claude',
      events: [],
      latestEvent: null,
      latestTimestamp: 1,
      currentAgentState: null,
      currentAgentEntry: null,
      unread: true,
      responsePreview: ''
    }
  ]
  Object.assign(fixture, {
    mounted: true,
    available: true,
    eligible: true,
    destination: false,
    host: 'local',
    settingsAvailable: true
  })
  Object.assign(fixture.state, { activeView: 'activity', activeWorktreeId: '' })
  fixture.jump.mockReset().mockImplementation(() => {
    fixture.state.activeView = 'terminal'
    fixture.state.activeWorktreeId = makeWorktree().id
    fixture.mounted = false
    fixture.destination = true
    notify()
    return true
  })
})
afterEach(() => {
  expect(fixture.listeners.size).toBe(0)
  vi.unstubAllGlobals()
})
it('allows normal source unmount and observes the workspace after one original parent call', async () => {
  const result = await request()
  expect(result).toMatchObject({
    applied: true,
    dispatched: true,
    persisted: null,
    writeOutcome: 'not_requested',
    rendered: null,
    navigationAction: {
      operation: 'jump',
      reached: 'workspace',
      remoteAck: 'unknown',
      requestAccepted: true
    }
  })
  expect(fixture.jump).toHaveBeenCalledExactlyOnceWith(fixture.threads[0])
})
it('does not mistake an accepted activation request for a rendered destination', async () => {
  fixture.jump.mockImplementation(() => true)
  expect(await request()).toMatchObject({
    applied: false,
    dispatched: true,
    navigationAction: { reached: 'none' }
  })
  expect(fixture.jump).toHaveBeenCalledTimes(1)
})
it.each(['missing', 'hidden', 'disabled', 'unmounted', 'expired'])(
  'rejects %s before invoking the original parent',
  async (kind) => {
    if (kind === 'missing') {
      fixture.available = false
    }
    if (kind === 'disabled') {
      fixture.eligible = false
    }
    if (kind === 'unmounted') {
      fixture.mounted = false
    }
    await expect(
      request(
        kind === 'expired' ? Date.now() - 1 : undefined,
        kind === 'hidden' ? 'hidden' : undefined
      )
    ).rejects.toThrow()
    expect(fixture.jump).not.toHaveBeenCalled()
  }
)
it('preserves original false and unknown callback results without claiming a destination', async () => {
  fixture.destination = true
  fixture.jump.mockReturnValue(false)
  expect(await request()).toMatchObject({
    applied: false,
    navigationAction: { requestAccepted: false, reached: 'none' }
  })
  fixture.jump.mockReturnValue(undefined)
  expect(await request()).toMatchObject({
    applied: false,
    navigationAction: { requestAccepted: null, reached: 'none' }
  })
})
it('does not replay on a runtime generation change', async () => {
  fixture.jump.mockImplementation(() => {
    bumpProviderRuntimeSessionGeneration()
    return true
  })
  expect(await request()).toMatchObject({ applied: false, reason: 'viewer_runtime_changed' })
  expect(fixture.jump).toHaveBeenCalledTimes(1)
})
it('detects another navigation even when it returns to the target before observation', async () => {
  fixture.jump.mockImplementation(() => {
    fixture.state.activeView = 'terminal'
    fixture.state.activeWorktreeId = makeWorktree().id
    notify()
    fixture.state.activeWorktreeId = 'different'
    notify()
    fixture.state.activeWorktreeId = makeWorktree().id
    fixture.destination = true
    notify()
    return true
  })
  expect(await request()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  expect(fixture.jump).toHaveBeenCalledTimes(1)
})
it('releases the observer if the original parent throws', async () => {
  fixture.jump.mockImplementation(() => {
    throw new Error('original_error')
  })
  await expect(request()).rejects.toThrow('original_error')
})

it('does not accept a changed host owner that later returns to the original owner', async () => {
  fixture.jump.mockImplementation(() => {
    fixture.state.activeView = 'terminal'
    fixture.state.activeWorktreeId = makeWorktree().id
    notify()
    fixture.host = 'ssh:other'
    notify()
    fixture.host = 'local'
    fixture.destination = true
    notify()
    return true
  })
  expect(await request()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  expect(fixture.jump).toHaveBeenCalledTimes(1)
})
it('does not fill an unresolved owner with the local host', async () => {
  fixture.host = ''
  expect(await request()).toMatchObject({ applied: false, navigationAction: { reached: 'none' } })
  expect(fixture.jump).toHaveBeenCalledTimes(1)
})

it('detects navigation away before the destination owner hydrates', async () => {
  fixture.jump.mockImplementation(() => {
    fixture.host = ''
    fixture.state.activeView = 'terminal'
    fixture.state.activeWorktreeId = makeWorktree().id
    notify()
    fixture.state.activeWorktreeId = 'different'
    notify()
    fixture.state.activeWorktreeId = makeWorktree().id
    fixture.host = 'local'
    fixture.destination = true
    notify()
    return true
  })
  expect(await request()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  expect(fixture.jump).toHaveBeenCalledTimes(1)
})
it('rejects settings loss after the original callback without replay', async () => {
  fixture.jump.mockImplementation(() => {
    fixture.settingsAvailable = false
    fixture.destination = true
    fixture.state.activeView = 'terminal'
    fixture.state.activeWorktreeId = makeWorktree().id
    notify()
    return true
  })
  expect(await request()).toMatchObject({ applied: false, reason: 'viewer_runtime_changed' })
  expect(fixture.jump).toHaveBeenCalledTimes(1)
})
