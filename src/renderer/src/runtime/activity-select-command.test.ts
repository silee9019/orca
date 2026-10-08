// @vitest-environment happy-dom
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
  const focusInputs: HTMLTextAreaElement[] = []
  return {
    mounted: true,
    available: true,
    eligible: true,
    destination: false,
    host: 'local',
    settingsAvailable: true,
    threads,
    focusInputs,
    jump: vi.fn<(thread: AgentPaneThread) => boolean | void>(),
    select: vi.fn<() => string | void>(),
    selection: false,
    selectionReached: 'none',
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
vi.mock('./activity-selection-destination', () => ({
  isActivitySelectionTargetSelected: () => fixture.selection,
  readActivitySelectionDestination: () => ({
    reached:
      fixture.focusInputs.length > 0 && document.activeElement !== fixture.focusInputs[0]
        ? 'none'
        : fixture.selectionReached,
    contentState: 'unknown'
  })
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
          select: fixture.select,
          canJump: () => fixture.eligible
        }
      : null
}))
const request = (expiresAt = Date.now() + 120, paneKey = 'pane') =>
  applyActivityViewerRequest({
    id: 'jump',
    expiresAt,
    command: { viewer: 'host', surface: 'activity-page', operation: 'select', paneKey }
  })
function notify(): void {
  for (const listener of fixture.listeners) {
    listener()
  }
}
beforeEach(() => {
  fixture.focusInputs.length = 0
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
  fixture.select.mockReset().mockImplementation(() => {
    fixture.state.activeView = 'terminal'
    fixture.state.activeWorktreeId = makeWorktree().id
    fixture.mounted = false
    fixture.destination = true
    fixture.selection = true
    fixture.selectionReached = 'terminal-pane'
    notify()
    return 'terminal-focus-requested'
  })
  fixture.selection = false
  fixture.selectionReached = 'none'
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
it('observes exact pane arrival after one original select and normal source unmount', async () => {
  expect(await request()).toMatchObject({
    applied: true,
    rendered: null,
    navigationAction: {
      operation: 'select',
      reached: 'terminal-pane',
      requestOutcome: 'terminal-focus-requested',
      remoteAck: 'unknown'
    }
  })
  expect(fixture.select).toHaveBeenCalledExactlyOnceWith(fixture.threads[0])
  expect(fixture.jump).not.toHaveBeenCalled()
})
it('preserves workspace-only partial arrival for a retained closed tab', async () => {
  fixture.select.mockImplementation(() => {
    fixture.state.activeView = 'terminal'
    fixture.state.activeWorktreeId = makeWorktree().id
    fixture.destination = true
    fixture.mounted = false
    notify()
    return 'workspace-only'
  })
  expect(await request()).toMatchObject({
    applied: false,
    navigationAction: { reached: 'workspace', requestOutcome: 'workspace-only' }
  })
  expect(fixture.select).toHaveBeenCalledTimes(1)
})
it('does not treat the request result as actual pane arrival', async () => {
  fixture.select.mockImplementation(() => 'terminal-focus-requested')
  expect(await request()).toMatchObject({ applied: false, navigationAction: { reached: 'none' } })
})
it('invokes the original select even when jump is disabled', async () => {
  fixture.eligible = false
  expect(await request()).toMatchObject({ applied: true })
  expect(fixture.select).toHaveBeenCalledTimes(1)
})
it('fences a target tab selection that leaves and returns during the original action', async () => {
  fixture.select.mockImplementation(() => {
    fixture.state.activeView = 'terminal'
    fixture.state.activeWorktreeId = makeWorktree().id
    fixture.selection = true
    notify()
    fixture.selection = false
    notify()
    fixture.selection = true
    fixture.selectionReached = 'terminal-pane'
    fixture.destination = true
    notify()
    return 'terminal-focus-requested'
  })
  expect(await request()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('never retries a throwing select parent', async () => {
  fixture.select.mockImplementation(() => {
    throw new Error('original_error')
  })
  await expect(request()).rejects.toThrow('original_error')
  expect(fixture.select).toHaveBeenCalledTimes(1)
})

it('rejects a runtime generation change without replaying the select parent', async () => {
  fixture.select.mockImplementation(() => {
    bumpProviderRuntimeSessionGeneration()
    return 'terminal-focus-requested'
  })
  expect(await request()).toMatchObject({ applied: false, reason: 'viewer_runtime_changed' })
  expect(fixture.select).toHaveBeenCalledTimes(1)
})
it('fences focus that reaches the exact leaf and then leaves and returns', async () => {
  const listeners = new Set<() => void>()
  vi.stubGlobal('document', {
    addEventListener: (name: string, listener: () => void) => {
      if (name === 'focusin') {
        listeners.add(listener)
      }
    },
    removeEventListener: (name: string, listener: () => void) => {
      if (name === 'focusin') {
        listeners.delete(listener)
      }
    }
  })
  fixture.select.mockImplementation(() => {
    fixture.state.activeView = 'terminal'
    fixture.state.activeWorktreeId = makeWorktree().id
    fixture.selection = true
    fixture.destination = true
    fixture.selectionReached = 'terminal-pane'
    for (const listener of listeners) {
      listener()
    }
    fixture.selectionReached = 'none'
    for (const listener of listeners) {
      listener()
    }
    fixture.selectionReached = 'terminal-pane'
    return 'terminal-focus-requested'
  })
  expect(await request()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  expect(listeners.size).toBe(0)
  expect(fixture.select).toHaveBeenCalledTimes(1)
})

it.each(['blur', 'remove'])(
  'fences actual DOM %s and return before the next poll',
  async (kind) => {
    const input = document.createElement('textarea')
    document.body.append(input)
    fixture.focusInputs.push(input)
    fixture.select.mockImplementation(() => {
      fixture.state.activeView = 'terminal'
      fixture.state.activeWorktreeId = makeWorktree().id
      fixture.selection = true
      fixture.destination = true
      fixture.selectionReached = 'terminal-pane'
      input.focus()
      if (kind === 'blur') {
        input.blur()
      } else {
        input.remove()
        document.body.append(input)
      }
      input.focus()
      return 'terminal-focus-requested'
    })
    expect(await request()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
    expect(fixture.select).toHaveBeenCalledTimes(1)
    input.remove()
  }
)
