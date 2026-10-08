import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  getProviderRuntimeContextKey,
  bumpProviderRuntimeSessionGeneration
} from '@/lib/provider-runtime-context'
import { makePersistedUI } from '@/store/slices/ui-slice-test-harness'
import type { WorkspaceBoardControl } from './workspace-board-viewer-view'

type Status = { id: string; label: string; color?: string; icon?: string }
const initialStatuses = (): Status[] => [
  { id: 'todo', label: 'Todo', color: 'blue', icon: 'circle' },
  { id: 'doing', label: 'Doing', color: 'amber', icon: 'timer' },
  { id: 'done', label: 'Done', color: 'emerald', icon: 'circle-check' }
]
const fixture = vi.hoisted(() => {
  const settings: { activeRuntimeEnvironmentId: string | null } = {
    activeRuntimeEnvironmentId: null
  }
  const noControl = (): WorkspaceBoardControl | null => null
  const noRuntimeKey = (): string | null => null
  const noStatuses = (): Status[] => []
  const noDurableStatuses = (): Status[] | undefined => undefined
  const noDurableWidth = (): number | undefined => undefined
  return {
    state: {
      settings,
      persistedUIReady: true,
      workspaceStatuses: noStatuses(),
      workspaceBoardColumnWidth: 308
    },
    open: true,
    mounted: true,
    viewRuntimeContextKey: noRuntimeKey(),
    publishedStatuses: noStatuses(),
    publishedWidth: 308,
    durableStatuses: noDurableStatuses(),
    durableWidth: noDurableWidth(),
    control: noControl()
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('./workspace-board-viewer-view', () => ({
  readWorkspaceBoardControl: () => (fixture.mounted && fixture.open ? fixture.control : null),
  readWorkspaceBoardView: () =>
    fixture.mounted && fixture.open
      ? {
          runtimeContextKey:
            fixture.viewRuntimeContextKey ?? getProviderRuntimeContextKey(fixture.state.settings),
          open: fixture.open,
          columnWidth: fixture.publishedWidth,
          statuses: fixture.publishedStatuses
        }
      : null
}))
import { applyWorkspaceBoardRequest } from './workspace-board-viewer-bridge'
import type { WorkspaceBoardCommand } from '../../../shared/rpc-contract/workspace-board-params'

const request = (command: WorkspaceBoardCommand, validForMs = 9000) => ({
  id: 'r',
  expiresAt: Date.now() + validForMs,
  command
})
const host = { viewer: 'host' } as const
// Mirrors the board: the store changes at once, the committed render and the host write follow.
const commit = (statuses: Status[], persistAfterMs = 0): void => {
  fixture.state.workspaceStatuses = statuses
  fixture.publishedStatuses = statuses
  setTimeout(() => {
    fixture.durableStatuses = statuses
  }, persistAfterMs)
}
const control = (): WorkspaceBoardControl => {
  const current = (): Status[] => fixture.state.workspaceStatuses
  return {
    addStatus: vi.fn(() =>
      commit([...current(), { id: `status-${current().length + 1}`, label: 'Status 4' }])
    ),
    renameStatus: vi.fn((id: string, label: string) =>
      commit(current().map((s) => (s.id === id ? { ...s, label: label.trim() } : s)))
    ),
    changeStatusColor: vi.fn((id: string, color: string) =>
      commit(current().map((s) => (s.id === id ? { ...s, color } : s)))
    ),
    changeStatusIcon: vi.fn((id: string, icon: string) =>
      commit(current().map((s) => (s.id === id ? { ...s, icon } : s)))
    ),
    moveStatus: vi.fn((id: string, direction: -1 | 1) => {
      const next = [...current()]
      const index = next.findIndex((s) => s.id === id)
      const [moved] = next.splice(index, 1)
      next.splice(index + direction, 0, moved)
      commit(next)
    }),
    removeStatus: vi.fn((id: string) => commit(current().filter((s) => s.id !== id))),
    setColumnWidth: vi.fn((width: number) => {
      fixture.state.workspaceBoardColumnWidth = width
      fixture.publishedWidth = width
      setTimeout(() => {
        fixture.durableWidth = width
      }, 0)
    })
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
beforeEach(() => {
  vi.clearAllMocks()
  const statuses = initialStatuses()
  Object.assign(fixture.state, {
    settings: { activeRuntimeEnvironmentId: null },
    persistedUIReady: true,
    workspaceStatuses: statuses,
    workspaceBoardColumnWidth: 308
  })
  Object.assign(fixture, {
    open: true,
    mounted: true,
    viewRuntimeContextKey: null,
    publishedStatuses: statuses,
    publishedWidth: 308,
    durableStatuses: statuses,
    durableWidth: 308,
    control: control()
  })
  vi.stubGlobal('window', {
    api: {
      ui: {
        get: vi.fn(async () => ({
          workspaceStatuses: fixture.durableStatuses,
          workspaceBoardColumnWidth: fixture.durableWidth
        }))
      }
    }
  })
})

it('reads the board without touching it and reports a closed board as unavailable', async () => {
  expect(await applyWorkspaceBoardRequest(request({ ...host, operation: 'get' }))).toMatchObject({
    dispatched: false,
    applied: true,
    persisted: null,
    writeOutcome: 'not_requested',
    columnWidth: 308,
    rendered: { open: true, columnWidth: 308 }
  })
  fixture.open = false
  expect(await applyWorkspaceBoardRequest(request({ ...host, operation: 'get' }))).toMatchObject({
    applied: false,
    reason: 'workspace_board_unavailable'
  })
})
it('applies each status operation through the published board control and reads back the host', async () => {
  const cases: [WorkspaceBoardCommand, keyof WorkspaceBoardControl, unknown[], string[]][] = [
    [{ ...host, operation: 'status-add' }, 'addStatus', [], ['todo', 'doing', 'done', 'status-4']],
    [
      { ...host, operation: 'status-rename', statusId: 'doing', label: ' Review ' },
      'renameStatus',
      ['doing', ' Review '],
      ['todo', 'doing', 'done']
    ],
    [
      { ...host, operation: 'status-color', statusId: 'todo', color: 'rose' },
      'changeStatusColor',
      ['todo', 'rose'],
      ['todo', 'doing', 'done']
    ],
    [
      { ...host, operation: 'status-icon', statusId: 'todo', icon: 'flag' },
      'changeStatusIcon',
      ['todo', 'flag'],
      ['todo', 'doing', 'done']
    ],
    [
      { ...host, operation: 'status-move', statusId: 'doing', direction: 'left' },
      'moveStatus',
      ['doing', -1],
      ['doing', 'todo', 'done']
    ],
    [
      { ...host, operation: 'status-move', statusId: 'doing', direction: 'right' },
      'moveStatus',
      ['doing', 1],
      ['todo', 'done', 'doing']
    ],
    [
      { ...host, operation: 'status-remove', statusId: 'doing' },
      'removeStatus',
      ['doing'],
      ['todo', 'done']
    ]
  ]
  for (const [command, method, callArgs, ids] of cases) {
    beforeEachReset()
    const result = await applyWorkspaceBoardRequest(request(command))
    expect(fixture.control?.[method]).toHaveBeenCalledExactlyOnceWith(...callArgs)
    expect(result).toMatchObject({ dispatched: true, applied: true, persisted: true })
    expect(result.statuses.map((s) => s.id)).toEqual(ids)
    expect(result.reason).toBeUndefined()
    expect(result.reassignment).toBe(
      command.operation === 'status-remove' ? 'unknown' : 'not_requested'
    )
  }
})
function beforeEachReset(): void {
  const statuses = initialStatuses()
  Object.assign(fixture.state, { workspaceStatuses: statuses })
  Object.assign(fixture, {
    publishedStatuses: statuses,
    durableStatuses: statuses,
    control: control()
  })
}
it('sets the column width and checks the host width, not the status list', async () => {
  expect(
    await applyWorkspaceBoardRequest(request({ ...host, operation: 'column-width', width: 400 }))
  ).toMatchObject({ dispatched: true, applied: true, persisted: true, columnWidth: 400 })
  expect(fixture.control?.setColumnWidth).toHaveBeenCalledExactlyOnceWith(400)
})
it('refuses actions the board would ignore or cannot reach, before changing anything', async () => {
  const refuse = async (command: WorkspaceBoardCommand, message: string) => {
    await expect(applyWorkspaceBoardRequest(request(command))).rejects.toThrow(message)
    for (const method of [
      'addStatus',
      'renameStatus',
      'changeStatusColor',
      'changeStatusIcon',
      'moveStatus',
      'removeStatus',
      'setColumnWidth'
    ] as const) {
      expect(fixture.control?.[method]).not.toHaveBeenCalled()
    }
  }
  await refuse(
    { ...host, operation: 'status-rename', statusId: 'ghost', label: 'x' },
    'workspace_status_unavailable'
  )
  await refuse(
    { ...host, operation: 'status-move', statusId: 'todo', direction: 'left' },
    'workspace_status_action_unavailable'
  )
  await refuse(
    { ...host, operation: 'status-move', statusId: 'done', direction: 'right' },
    'workspace_status_action_unavailable'
  )
  fixture.state.workspaceStatuses = fixture.publishedStatuses = [initialStatuses()[0]]
  await refuse(
    { ...host, operation: 'status-remove', statusId: 'todo' },
    'workspace_status_action_unavailable'
  )
  fixture.open = false
  await refuse({ ...host, operation: 'status-add' }, 'workspace_board_unavailable')
  fixture.open = true
  fixture.mounted = false
  await refuse({ ...host, operation: 'column-width', width: 300 }, 'workspace_board_unavailable')
})
it('refuses a board from another runtime or a viewer that is not ready', async () => {
  fixture.viewRuntimeContextKey = 'other#1'
  vi.useFakeTimers()
  const pending = expect(
    applyWorkspaceBoardRequest(request({ ...host, operation: 'status-add' }))
  ).rejects.toThrow('workspace_board_unavailable')
  await vi.advanceTimersByTimeAsync(1100)
  await pending
  vi.useRealTimers()
  fixture.viewRuntimeContextKey = null
  fixture.state.persistedUIReady = false
  await expect(applyWorkspaceBoardRequest(request({ ...host, operation: 'get' }))).rejects.toThrow(
    'viewer_not_ready'
  )
  fixture.state.persistedUIReady = true
  fixture.state.settings = { activeRuntimeEnvironmentId: 'remote' }
  await expect(applyWorkspaceBoardRequest(request({ ...host, operation: 'get' }))).rejects.toThrow(
    'viewer_runtime_mismatch'
  )
})
it('waits for the board to render the store before dispatching, so a second call never works from stale statuses', async () => {
  // The store already holds a new status the committed render has not shown yet.
  fixture.state.workspaceStatuses = [...initialStatuses(), { id: 'new', label: 'New' }]
  setTimeout(() => {
    fixture.publishedStatuses = fixture.state.workspaceStatuses
    fixture.durableStatuses = fixture.state.workspaceStatuses
  }, 60)
  const result = await applyWorkspaceBoardRequest(
    request({ ...host, operation: 'status-rename', statusId: 'new', label: 'Renamed' })
  )
  expect(fixture.control?.renameStatus).toHaveBeenCalledExactlyOnceWith('new', 'Renamed')
  expect(result.statuses.find((s) => s.id === 'new')?.label).toBe('Renamed')
})
it('waits for a delayed host write before claiming persistence', async () => {
  fixture.control = {
    ...control(),
    renameStatus: vi.fn((id: string, label: string) =>
      commit(
        fixture.state.workspaceStatuses.map((s) => (s.id === id ? { ...s, label } : s)),
        80
      )
    )
  }
  const result = await applyWorkspaceBoardRequest(
    request({ ...host, operation: 'status-rename', statusId: 'todo', label: 'Later' })
  )
  expect(result).toMatchObject({ applied: true, persisted: true })
  expect(vi.mocked(window.api.ui.get).mock.calls.length).toBeGreaterThan(1)
})
it('does not claim persistence the host never shows, or a read that never answers', async () => {
  fixture.control = {
    ...control(),
    renameStatus: vi.fn((id: string, label: string) => {
      fixture.state.workspaceStatuses = fixture.publishedStatuses =
        fixture.state.workspaceStatuses.map((s) => (s.id === id ? { ...s, label } : s))
    })
  }
  expect(
    await applyWorkspaceBoardRequest(
      request({ ...host, operation: 'status-rename', statusId: 'todo', label: 'Lost' }, 700)
    )
  ).toMatchObject({ persisted: false, reason: 'persistence_superseded' })
  beforeEachReset()
  vi.mocked(window.api.ui.get).mockImplementation(() => new Promise<never>(() => undefined))
  expect(
    await applyWorkspaceBoardRequest(request({ ...host, operation: 'status-add' }, 700))
  ).toMatchObject({ persisted: null, reason: 'persistence_unverifiable' })
})
it('stops waiting when the board changes again during the operation, and fences the runtime', async () => {
  vi.mocked(window.api.ui.get).mockImplementationOnce(async () => {
    fixture.state.workspaceStatuses = fixture.publishedStatuses = [
      ...fixture.state.workspaceStatuses,
      { id: 'user-added', label: 'User added' }
    ]
    return makePersistedUI()
  })
  expect(
    await applyWorkspaceBoardRequest(
      request({ ...host, operation: 'status-color', statusId: 'todo', color: 'rose' })
    )
  ).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  beforeEachReset()
  vi.mocked(window.api.ui.get).mockImplementationOnce(async () => {
    bumpProviderRuntimeSessionGeneration()
    return makePersistedUI()
  })
  expect(
    await applyWorkspaceBoardRequest(
      request({ ...host, operation: 'status-color', statusId: 'todo', color: 'rose' })
    )
  ).toMatchObject({ applied: false, persisted: null, reason: 'viewer_runtime_changed' })
})
it('rejects an expired request without touching the board', async () => {
  await expect(
    applyWorkspaceBoardRequest({ ...request({ ...host, operation: 'status-add' }), expiresAt: 1 })
  ).rejects.toThrow('request_expired')
  expect(fixture.control?.addStatus).not.toHaveBeenCalled()
})
