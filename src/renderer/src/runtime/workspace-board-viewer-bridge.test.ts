import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  getProviderRuntimeContextKey,
  bumpProviderRuntimeSessionGeneration
} from '@/lib/provider-runtime-context'
import { makePersistedUI } from '@/store/slices/ui-slice-test-harness'
import type { WorkspaceBoardControl } from './workspace-board-viewer-view'

type Status = { id: string; label: string; color?: string; icon?: string }
type Workspace = { id: string; repoId: string; statusId: string; hostId: string }
type Lease = {
  providerRequestId: string
  waiterLeaseId: string
  release: (reason: string) => void
  result: Promise<unknown>
}
type AcquireLease = (settings: unknown, repoId: string, options: unknown) => Lease
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
  const noWorkspaces = (): Workspace[] | undefined => undefined
  const noHostWorkspaces = (): Workspace[] => []
  const noAnswer = (): ((repoId: string) => Promise<unknown>) | null => null
  const noAcquire = () => vi.fn<AcquireLease>()
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
    control: noControl(),
    publishedWorkspaces: noWorkspaces(),
    hostWorkspaces: noHostWorkspaces(),
    taskStatusSyncEnabled: false,
    listAnswer: noAnswer(),
    acquire: noAcquire()
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('@/store/slices/worktrees/listing/detected-worktree-refresh', () => ({
  acquireDetectedWorktreeRefreshLeaseForRepo: (
    settings: unknown,
    repoId: string,
    options: unknown
  ) => fixture.acquire(settings, repoId, options)
}))
vi.mock('./workspace-board-viewer-view', () => ({
  readWorkspaceBoardControl: () => (fixture.mounted && fixture.open ? fixture.control : null),
  readWorkspaceBoardView: () =>
    fixture.mounted && fixture.open
      ? {
          runtimeContextKey:
            fixture.viewRuntimeContextKey ?? getProviderRuntimeContextKey(fixture.state.settings),
          open: fixture.open,
          columnWidth: fixture.publishedWidth,
          statuses: fixture.publishedStatuses,
          workspaces: fixture.publishedWorkspaces,
          taskStatusSyncEnabled: fixture.taskStatusSyncEnabled
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
    }),
    assignWorkspaces: vi.fn((ids: readonly string[], statusId: string) => {
      commitAssignment(ids, statusId)
      return { taskStatusSyncRequested: fixture.taskStatusSyncEnabled && ids.length > 0 }
    })
  }
}
const withStatus = (workspaces: Workspace[], ids: readonly string[], statusId: string) =>
  workspaces.map((w) => (ids.includes(w.id) ? { ...w, statusId } : w))
// Mirrors the board: the render changes at once, the host write lands later (or never).
function commitAssignment(ids: readonly string[], statusId: string, hostWrites = true): void {
  fixture.publishedWorkspaces = withStatus(fixture.publishedWorkspaces ?? [], ids, statusId)
  if (hostWrites) {
    setTimeout(() => {
      fixture.hostWorkspaces = withStatus(fixture.hostWorkspaces, ids, statusId)
    }, 0)
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
  const workspaces = initialWorkspaces()
  Object.assign(fixture, {
    publishedWorkspaces: workspaces,
    hostWorkspaces: workspaces,
    taskStatusSyncEnabled: false
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
  fixture.listAnswer = null
  fixture.acquire = vi.fn<AcquireLease>((_settings, repoId) => ({
    providerRequestId: 'p',
    waiterLeaseId: 'w',
    release: vi.fn(),
    result: (fixture.listAnswer ?? completeAnswer)(repoId)
  }))
})
// What the app's own local detected-worktree read answers from the host's catalog.
const completeAnswer = async (repoId: string) => ({
  status: 'complete',
  providerRequestId: 'p',
  repoId,
  authority: { kind: 'local', executionHostId: 'local' },
  result: {
    repoId,
    authoritative: true,
    source: 'git',
    worktrees: fixture.hostWorkspaces
      .filter((w) => w.repoId === repoId)
      .map((w) => ({ id: w.id, repoId: w.repoId, workspaceStatus: w.statusId }))
  }
})
const initialWorkspaces = (): Workspace[] => [
  { id: 'r1::/a', repoId: 'r1', statusId: 'todo', hostId: 'local' },
  { id: 'r1::/b', repoId: 'r1', statusId: 'doing', hostId: 'local' },
  { id: 'r2::/c', repoId: 'r2', statusId: 'todo', hostId: 'ssh:box' },
  // A folder project's workspace is an ordinary board workspace: its id is the repo id and the folder path.
  { id: 'folder-repo::/notes', repoId: 'folder-repo', statusId: 'todo', hostId: 'local' }
]

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
  const workspaces = initialWorkspaces()
  Object.assign(fixture, {
    publishedStatuses: statuses,
    durableStatuses: statuses,
    publishedWorkspaces: workspaces,
    hostWorkspaces: workspaces,
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
const assign = (workspaceIds: string[], statusId: string, validForMs?: number) =>
  applyWorkspaceBoardRequest(
    request({ ...host, operation: 'assign', workspaceIds, statusId }, validForMs)
  )
const listedRepos = (): string[] => fixture.acquire.mock.calls.map((call) => String(call[1]))

it('assigns only the changed workspaces and confirms the write on the local host', async () => {
  const result = await assign(['r1::/a', 'r1::/b'], 'doing')
  expect(fixture.control?.assignWorkspaces).toHaveBeenCalledExactlyOnceWith(['r1::/a'], 'doing')
  expect(result).toMatchObject({
    dispatched: true,
    applied: true,
    persisted: true,
    writeOutcome: 'unknown',
    assignment: {
      statusId: 'doing',
      workspaces: [
        { workspaceId: 'r1::/a', hostId: 'local', changed: true, hostWrite: 'confirmed' },
        { workspaceId: 'r1::/b', hostId: 'local', changed: false, hostWrite: 'not_requested' }
      ],
      taskStatusSync: 'not_requested',
      writeFailureReporting: 'swallowed_by_store'
    }
  })
  expect(result.reason).toBeUndefined()
  expect(result.rendered?.workspaces?.find((w) => w.id === 'r1::/a')?.statusId).toBe('doing')
})
it('treats a folder project workspace like any other local board workspace', async () => {
  const result = await assign(['folder-repo::/notes'], 'done')
  expect(fixture.control?.assignWorkspaces).toHaveBeenCalledExactlyOnceWith(
    ['folder-repo::/notes'],
    'done'
  )
  expect(result).toMatchObject({ applied: true, persisted: true })
  expect(listedRepos()).toContain('folder-repo')
})
it('never reads or claims a write on an SSH host, so the result stays unverifiable', async () => {
  const result = await assign(['r1::/a', 'r2::/c'], 'done')
  expect(fixture.control?.assignWorkspaces).toHaveBeenCalledExactlyOnceWith(
    ['r1::/a', 'r2::/c'],
    'done'
  )
  expect(listedRepos()).not.toContain('r2')
  expect(result).toMatchObject({
    applied: true,
    persisted: null,
    reason: 'persistence_unverifiable',
    assignment: {
      workspaces: [
        { workspaceId: 'r1::/a', hostWrite: 'confirmed' },
        { workspaceId: 'r2::/c', hostId: 'ssh:box', hostWrite: 'unverifiable' }
      ]
    }
  })
})
it('reports a local write the host never shows as not confirmed instead of a success', async () => {
  fixture.control = {
    ...control(),
    assignWorkspaces: vi.fn((ids: readonly string[], statusId: string) => {
      commitAssignment(ids, statusId, false)
      return { taskStatusSyncRequested: false }
    })
  }
  expect(await assign(['r1::/a'], 'done', 700)).toMatchObject({
    dispatched: true,
    applied: true,
    persisted: false,
    reason: 'persistence_superseded',
    assignment: { workspaces: [{ workspaceId: 'r1::/a', hostWrite: 'not_confirmed' }] }
  })
})
it('reports a write the store reverted as not applied', async () => {
  fixture.control = {
    ...control(),
    assignWorkspaces: vi.fn((ids: readonly string[], statusId: string) => {
      commitAssignment(ids, statusId, false)
      setTimeout(() => {
        fixture.publishedWorkspaces = initialWorkspaces()
      }, 150)
      return { taskStatusSyncRequested: false }
    })
  }
  expect(await assign(['r1::/a'], 'done', 700)).toMatchObject({
    applied: false,
    persisted: false,
    assignment: { workspaces: [{ hostWrite: 'not_confirmed' }] }
  })
})
it('does not claim a write when the host list cannot be read', async () => {
  fixture.listAnswer = () => new Promise<never>(() => undefined)
  expect(await assign(['r1::/a'], 'done', 700)).toMatchObject({
    persisted: null,
    reason: 'persistence_unverifiable',
    assignment: { workspaces: [{ hostWrite: 'unverifiable' }] }
  })
  const lease = fixture.acquire.mock.results.at(-1)?.value
  expect(lease.release).toHaveBeenCalledWith('stopped')
  fixture.listAnswer = () => Promise.reject(new Error('ipc down'))
  expect(await assign(['r1::/b'], 'todo', 700)).toMatchObject({
    persisted: null,
    assignment: { workspaces: [{ hostWrite: 'unverifiable' }] }
  })
  fixture.acquire = vi.fn<AcquireLease>(() => {
    throw new Error('no provider')
  })
  expect(await assign(['r1::/b'], 'done', 700)).toMatchObject({
    persisted: null,
    assignment: { workspaces: [{ hostWrite: 'unverifiable' }] }
  })
})
it('waits for a delayed local write before confirming it', async () => {
  fixture.control = {
    ...control(),
    assignWorkspaces: vi.fn((ids: readonly string[], statusId: string) => {
      commitAssignment(ids, statusId, false)
      setTimeout(() => {
        fixture.hostWorkspaces = withStatus(fixture.hostWorkspaces, ids, statusId)
      }, 250)
      return { taskStatusSyncRequested: false }
    })
  }
  expect(await assign(['r1::/a'], 'done')).toMatchObject({ persisted: true, applied: true })
  expect(listedRepos().length).toBeGreaterThan(1)
})
it('reports whether the board asked for a task status sync, without waiting for its outcome', async () => {
  fixture.taskStatusSyncEnabled = true
  expect(await assign(['r1::/a'], 'done')).toMatchObject({
    assignment: { taskStatusSync: 'requested' }
  })
  // Nothing changed, so there is nothing to sync.
  expect(await assign(['r1::/b'], 'doing')).toMatchObject({
    dispatched: false,
    assignment: { taskStatusSync: 'not_requested' }
  })
})
it('does nothing and says so when every workspace already has the status', async () => {
  const result = await assign(['r1::/b'], 'doing')
  expect(fixture.control?.assignWorkspaces).not.toHaveBeenCalled()
  expect(listedRepos()).toEqual([])
  expect(result).toMatchObject({
    dispatched: false,
    applied: true,
    persisted: null,
    writeOutcome: 'not_requested',
    assignment: {
      workspaces: [{ workspaceId: 'r1::/b', changed: false, hostWrite: 'not_requested' }]
    }
  })
})
it('refuses a status, workspace or board it cannot reach before touching anything', async () => {
  const refuse = async (ids: string[], statusId: string, message: string) => {
    await expect(assign(ids, statusId)).rejects.toThrow(message)
    expect(fixture.control?.assignWorkspaces).not.toHaveBeenCalled()
  }
  await refuse(['r1::/a'], 'ghost', 'workspace_status_unavailable')
  await refuse(['r1::/ghost'], 'done', 'workspace_unavailable')
  await refuse(['r1::/a', 'r1::/ghost'], 'done', 'workspace_unavailable')
  // A folder workspace of a project group is not on the board lanes, so the board cannot move it.
  await refuse(['folder:0c1d'], 'done', 'workspace_folder_unsupported')
  await refuse(['r1::/a', 'folder:0c1d'], 'done', 'workspace_folder_unsupported')
  fixture.publishedWorkspaces = undefined
  await refuse(['r1::/a'], 'done', 'workspace_board_unavailable')
  fixture.publishedWorkspaces = initialWorkspaces()
  fixture.open = false
  await refuse(['r1::/a'], 'done', 'workspace_board_unavailable')
})
it('asks only the local host, with an authoritative read, and never lists a remote one', async () => {
  await assign(['r1::/a', 'r2::/c'], 'done')
  expect(fixture.acquire).toHaveBeenCalledWith(expect.anything(), 'r1', {
    executionHostId: 'local',
    requireAuthoritative: true
  })
  expect(listedRepos()).toEqual(expect.not.arrayContaining(['r2']))
})
it('does not read an answer that is not an authoritative local listing as confirmed or failed', async () => {
  for (const answer of [
    { status: 'rejected' },
    { status: 'ambiguous-owner' },
    // Even a row that already shows the target must not count when the listing is not authoritative.
    {
      status: 'non-authoritative',
      result: { worktrees: [{ id: 'r1::/a', repoId: 'r1', workspaceStatus: 'done' }] }
    }
  ]) {
    beforeEachReset()
    fixture.listAnswer = async () => answer
    expect(await assign(['r1::/a'], 'done', 600)).toMatchObject({
      persisted: null,
      assignment: { workspaces: [{ hostWrite: 'unverifiable' }] }
    })
  }
})
it('leaves a workspace the host list does not contain unverifiable', async () => {
  fixture.hostWorkspaces = fixture.hostWorkspaces.filter((w) => w.id !== 'r1::/a')
  expect(await assign(['r1::/a'], 'done', 600)).toMatchObject({
    persisted: null,
    assignment: { workspaces: [{ hostWrite: 'unverifiable' }] }
  })
})
it('reads the default status of a host row that holds none', async () => {
  fixture.publishedWorkspaces = withStatus(fixture.publishedWorkspaces ?? [], ['r1::/a'], 'doing')
  fixture.hostWorkspaces = fixture.hostWorkspaces.map((w) =>
    w.id === 'r1::/a' ? { ...w, statusId: '' } : w
  )
  fixture.control = {
    ...control(),
    assignWorkspaces: vi.fn((ids: readonly string[], statusId: string) => {
      commitAssignment(ids, statusId, false)
      return { taskStatusSyncRequested: false }
    })
  }
  // An unset or retired host status resolves to the board's default (first) status, here todo.
  expect(await assign(['r1::/a'], 'todo')).toMatchObject({
    persisted: true,
    assignment: { workspaces: [{ hostWrite: 'confirmed' }] }
  })
})
it('reports a write that fails and reverts the board before the first check', async () => {
  fixture.control = {
    ...control(),
    assignWorkspaces: vi.fn((ids: readonly string[], statusId: string) => {
      commitAssignment(ids, statusId, false)
      // The board never shows the move: the write failed and the store reverted within the same tick.
      fixture.publishedWorkspaces = initialWorkspaces()
      return { taskStatusSyncRequested: false }
    })
  }
  const started = Date.now()
  expect(await assign(['r1::/a'], 'done', 1500)).toMatchObject({
    applied: false,
    persisted: false,
    reason: 'persistence_superseded',
    assignment: { workspaces: [{ hostWrite: 'not_confirmed' }] }
  })
  expect(fixture.acquire).toHaveBeenCalled()
  expect(Date.now() - started).toBeLessThan(1500)
})
it('lets one failed local write decide the result even beside a confirmed or remote one', async () => {
  fixture.control = {
    ...control(),
    assignWorkspaces: vi.fn((ids: readonly string[], statusId: string) => {
      commitAssignment(ids, statusId, false)
      // Only the first workspace reaches the host.
      setTimeout(() => {
        fixture.hostWorkspaces = withStatus(fixture.hostWorkspaces, ['r1::/a'], statusId)
      }, 0)
      return { taskStatusSyncRequested: false }
    })
  }
  expect(await assign(['r1::/a', 'folder-repo::/notes'], 'done', 700)).toMatchObject({
    persisted: false,
    assignment: {
      workspaces: [{ hostWrite: 'confirmed' }, { hostWrite: 'not_confirmed' }]
    }
  })
  beforeEachReset()
  expect(await assign(['folder-repo::/notes', 'r2::/c'], 'done', 700)).toMatchObject({
    persisted: null,
    assignment: { workspaces: [{ hostWrite: 'confirmed' }, { hostWrite: 'unverifiable' }] }
  })
})
it('reads every local repo the moved workspaces belong to', async () => {
  const result = await assign(['r1::/a', 'folder-repo::/notes'], 'done')
  expect(result).toMatchObject({ persisted: true })
  expect(listedRepos()).toEqual(expect.arrayContaining(['r1', 'folder-repo']))
})
it('moves a repeated id once', async () => {
  await assign(['r1::/a', 'r1::/a'], 'done')
  expect(fixture.control?.assignWorkspaces).toHaveBeenCalledExactlyOnceWith(['r1::/a'], 'done')
})
it('does not report a confirmed write for a runtime that changed during the read', async () => {
  fixture.listAnswer = async (repoId: string) => {
    bumpProviderRuntimeSessionGeneration()
    return completeAnswer(repoId)
  }
  expect(await assign(['r1::/a'], 'done')).toMatchObject({
    persisted: null,
    reason: 'viewer_runtime_changed'
  })
})
