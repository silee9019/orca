// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Worktree, WorkspaceStatusDefinition } from '../../../shared/worktree/types'
import type { WorkspaceBoardRequest } from '../../../shared/workspace-board-command'
import { normalizeWorkspaceStatuses } from '../../../shared/workspace-statuses'
import type * as TaskStatusSync from '@/components/sidebar/workspace-board-task-status-sync'
import type { WorkspaceBoardTaskStatusSyncResult } from '@/components/sidebar/workspace-board-task-status-sync'

const host = vi.hoisted(() => {
  const noStatuses = (): unknown[] => []
  const noWorktrees = (): Worktree[] => []
  const noWorktreesByRepo = (): Record<string, Worktree[]> => ({})
  return {
    durable: noStatuses(),
    worktrees: noWorktrees(),
    storeByRepo: noWorktreesByRepo(),
    failWrites: false
  }
})
// Unit tests must never reach a real Linear account: the sync is replaced and every Linear call is blocked.
const linear = vi.hoisted(() => {
  const blocked = vi.fn(async () => {
    throw new Error('real Linear call blocked')
  })
  const emptySync = (): WorkspaceBoardTaskStatusSyncResult => ({
    updated: 0,
    skipped: 0,
    failed: 0,
    messages: []
  })
  return {
    getIssue: blocked,
    updateIssue: blocked,
    teamStates: blocked,
    sync: vi.fn(async () => emptySync())
  }
})
// The host catalog the app's own local detected-worktree read would answer from.
vi.mock('@/store/slices/worktrees/listing/detected-worktree-refresh', () => ({
  acquireDetectedWorktreeRefreshLeaseForRepo: vi.fn((_settings: unknown, repoId: string) => ({
    providerRequestId: 'p',
    waiterLeaseId: 'w',
    release: vi.fn(),
    result: Promise.resolve({
      status: 'complete',
      providerRequestId: 'p',
      repoId,
      authority: { kind: 'local', executionHostId: 'local' },
      result: {
        repoId,
        authoritative: true,
        source: 'git',
        worktrees: host.worktrees.filter((worktree) => worktree.repoId === repoId)
      }
    })
  }))
}))
vi.mock('@/runtime/runtime-linear-issue-mutations', () => ({
  linearGetIssue: linear.getIssue,
  linearUpdateIssue: linear.updateIssue
}))
vi.mock('@/runtime/runtime-linear-project-client', () => ({ linearTeamStates: linear.teamStates }))
vi.mock('@/components/sidebar/workspace-board-task-status-sync', async (importOriginal) => ({
  ...(await importOriginal<typeof TaskStatusSync>()),
  syncWorkspaceBoardTaskStatuses: linear.sync
}))
vi.mock('@/store', async () => {
  const { create } = await import('zustand')
  const { normalizeWorkspaceStatuses } = await import('../../../shared/workspace-statuses')
  const useAppStore = create<Record<string, unknown>>(() => ({
    settings: { activeRuntimeEnvironmentId: null },
    persistedUIReady: true,
    workspaceStatuses: normalizeWorkspaceStatuses([
      { id: 'todo', label: 'Todo' },
      { id: 'doing', label: 'Doing' },
      { id: 'done', label: 'Done' }
    ]),
    workspaceBoardColumnWidth: 308,
    syncTaskStatusFromWorkspaceBoard: false,
    sortBy: 'name',
    worktreesByRepo: {},
    recordFeatureInteraction: vi.fn(),
    updateWorktreeMeta: vi.fn(async () => undefined),
    // Mirrors the real batch update: the store changes at once, the local host write follows (or fails and reverts).
    updateWorktreesMeta: vi.fn(
      async (batch: { worktreeId: string; updates: Partial<Worktree> }[]) => {
        const apply = (list: readonly Worktree[]): Worktree[] =>
          list.map((entry) => {
            const hit = batch.find((item) => item.worktreeId === entry.id)
            return hit ? { ...entry, ...hit.updates } : entry
          })
        const before = host.storeByRepo
        host.storeByRepo = Object.fromEntries(
          Object.entries(before).map(([repoId, list]) => [repoId, apply(list)])
        )
        useAppStore.setState({ worktreesByRepo: host.storeByRepo })
        if (host.failWrites) {
          setTimeout(() => {
            host.storeByRepo = before
            useAppStore.setState({ worktreesByRepo: before })
          }, 100)
          return
        }
        host.worktrees = apply(host.worktrees)
      }
    ),
    // Mirrors the real setter: normalize, then update the store and the host at once.
    setWorkspaceStatuses: (statuses: WorkspaceStatusDefinition[]) => {
      const normalized = normalizeWorkspaceStatuses(statuses)
      host.durable = normalized
      useAppStore.setState({ workspaceStatuses: normalized })
    },
    setWorkspaceBoardColumnWidth: vi.fn()
  }))
  return { useAppStore }
})
import { useAppStore } from '@/store'
import { useWorkspaceKanbanStatusActions } from '@/components/sidebar/use-workspace-kanban-status-actions'
import { useWorkspaceKanbanWorktreeActions } from '@/components/sidebar/use-workspace-kanban-worktree-actions'
import { useWorkspaceBoardTaskStatusSync } from '@/components/sidebar/use-workspace-board-task-status-sync'
import { buildUnambiguousWorktreeIdIndex } from '@/components/sidebar/worktree-unambiguous-id-index'
import { acquireDetectedWorktreeRefreshLeaseForRepo as acquireLease } from '@/store/slices/worktrees/listing/detected-worktree-refresh'
import { useWorkspaceBoardAssignment } from './use-workspace-board-assignment'
import { useWorkspaceBoardViewerPublication } from './use-workspace-board-viewer-publication'
import { attachWorkspaceBoardViewerBridge } from './workspace-board-viewer-bridge'

const makeWorktree = (id: string, workspaceStatus: string): Worktree => ({
  id,
  repoId: 'repo',
  path: `/tmp/${id}`,
  head: 'abc123',
  branch: 'refs/heads/feature',
  isBare: false,
  isMainWorktree: false,
  displayName: id,
  comment: '',
  linkedIssue: null,
  linkedPR: null,
  linkedLinearIssue: null,
  linkedGitLabMR: null,
  linkedGitLabIssue: null,
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 0,
  workspaceStatus
})

// Renders the board's real status actions and publication, with a store that renders on change.
function renderBoard(worktrees: readonly Worktree[]) {
  return renderHook(() => {
    const statuses = useAppStore((state) => state.workspaceStatuses)
    const width = useAppStore((state) => state.workspaceBoardColumnWidth)
    const setWorkspaceStatuses = useAppStore((state) => state.setWorkspaceStatuses)
    const updateWorktreeMeta = useAppStore((state) => state.updateWorktreeMeta)
    const setWidth = useAppStore((state) => state.setWorkspaceBoardColumnWidth)
    const actions = useWorkspaceKanbanStatusActions({
      allWorktrees: worktrees,
      workspaceStatuses: statuses,
      setWorkspaceStatuses,
      updateWorktreeMeta
    })
    useWorkspaceBoardViewerPublication({
      open: true,
      statuses,
      columnWidth: width,
      workspaces: [],
      taskStatusSyncEnabled: false,
      control: {
        addStatus: actions.handleAddStatus,
        renameStatus: actions.handleRenameStatus,
        changeStatusColor: actions.handleChangeStatusColor,
        changeStatusIcon: actions.handleChangeStatusIcon,
        moveStatus: actions.handleMoveStatus,
        removeStatus: actions.handleRemoveStatus,
        setColumnWidth: setWidth,
        assignWorkspaces: () => ({ taskStatusSyncRequested: false })
      }
    })
  })
}
// Renders the board's real move handler, sync hook and assignment wiring over the store's workspaces.
function renderAssignableBoard() {
  return renderHook(() => {
    const statuses = useAppStore((state) => state.workspaceStatuses)
    const width = useAppStore((state) => state.workspaceBoardColumnWidth)
    const syncEnabled = useAppStore((state) => state.syncTaskStatusFromWorkspaceBoard)
    const worktrees = useAppStore((state) => state.worktreesByRepo)
    const updateWorktreeMeta = useAppStore((state) => state.updateWorktreeMeta)
    const updateWorktreesMeta = useAppStore((state) => state.updateWorktreesMeta)
    const sortBy = useAppStore((state) => state.sortBy)
    const board = Object.values(worktrees).flat()
    const worktreeById = buildUnambiguousWorktreeIdIndex(board)
    const maybeSyncTaskStatuses = useWorkspaceBoardTaskStatusSync({
      enabled: syncEnabled,
      worktreesById: worktreeById,
      workspaceStatuses: statuses
    })
    const { moveWorktreesToStatus } = useWorkspaceKanbanWorktreeActions({
      boardDragGroups: [],
      laneFullWorktreeIds: new Map(),
      laneViews: new Map(),
      maybeSyncTaskStatuses,
      sortBy,
      updateWorktreeMeta,
      updateWorktreesMeta,
      workspaceStatuses: statuses,
      worktreeById,
      manualOrderCatalog: { orderedIds: [], rankByWorktreeId: new Map() },
      worktreesByStatus: new Map()
    })
    const { workspaces, assignWorkspaces } = useWorkspaceBoardAssignment({
      boardWorktrees: board,
      worktreeById,
      workspaceStatuses: statuses,
      syncTaskStatusFromWorkspaceBoard: syncEnabled,
      moveWorktreesToStatus
    })
    useWorkspaceBoardViewerPublication({
      open: true,
      statuses,
      columnWidth: width,
      workspaces,
      taskStatusSyncEnabled: syncEnabled,
      control: {
        addStatus: () => undefined,
        renameStatus: () => undefined,
        changeStatusColor: () => undefined,
        changeStatusIcon: () => undefined,
        moveStatus: () => undefined,
        removeStatus: () => undefined,
        setColumnWidth: () => undefined,
        assignWorkspaces
      }
    })
  })
}
const request = (id: string, command: WorkspaceBoardRequest['command']): WorkspaceBoardRequest => ({
  id,
  expiresAt: Date.now() + 9000,
  command
})
const viewer = { viewer: 'host' } as const
// Delivers requests the way the main process does and collects the renderer's answers.
function attachBridge() {
  const answers = new Map<
    string,
    { ok: boolean; result?: Record<string, unknown>; error?: string }
  >()
  let deliver: (request: WorkspaceBoardRequest) => void = () => undefined
  const detach = attachWorkspaceBoardViewerBridge({
    onWorkspaceBoardRequest: (callback) => {
      deliver = callback
      return () => undefined
    },
    respondWorkspaceBoard: (response) => {
      answers.set(
        response.id,
        response.ok
          ? { ok: true, result: { ...response.result } }
          : { ok: false, error: response.error }
      )
    }
  })
  return { answers, send: (value: WorkspaceBoardRequest) => deliver(value), detach }
}

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false)
  vi.clearAllMocks()
  host.failWrites = false
  host.durable = useAppStore.getState().workspaceStatuses
  const surface = document.createElement('div')
  surface.setAttribute('data-workspace-board-selection-surface', '')
  surface.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600)
  document.body.append(surface)
  vi.stubGlobal(
    'window',
    Object.assign(window, {
      api: {
        ui: {
          get: async () => ({ workspaceStatuses: host.durable, workspaceBoardColumnWidth: 308 })
        }
      }
    })
  )
})
afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
const waitFor = async (done: () => boolean) => {
  for (let i = 0; i < 200 && !done(); i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
  }
  expect(done()).toBe(true)
}

it('applies back-to-back requests through the real status actions without overwriting the first', async () => {
  renderBoard([])
  const bridge = attachBridge()
  bridge.send(
    request('a', { ...viewer, operation: 'status-rename', statusId: 'todo', label: 'Backlog' })
  )
  bridge.send(
    request('b', { ...viewer, operation: 'status-color', statusId: 'doing', color: 'rose' })
  )
  bridge.send(
    request('c', { ...viewer, operation: 'status-move', statusId: 'done', direction: 'left' })
  )
  await waitFor(() => bridge.answers.size === 3)
  for (const id of ['a', 'b', 'c']) {
    expect(bridge.answers.get(id)).toMatchObject({
      ok: true,
      result: { applied: true, persisted: true }
    })
  }
  const statuses = useAppStore.getState().workspaceStatuses
  expect(statuses.map((status) => [status.id, status.label, status.color])).toEqual([
    ['todo', 'Backlog', expect.any(String)],
    ['done', 'Done', expect.any(String)],
    ['doing', 'Doing', 'rose']
  ])
  expect(host.durable).toEqual(statuses)
  bridge.detach()
})
it('moves the removed status workspaces to its neighbor through the board handler and reports it unknown', async () => {
  const worktrees = [makeWorktree('w-doing', 'doing'), makeWorktree('w-todo', 'todo')]
  renderBoard(worktrees)
  const bridge = attachBridge()
  bridge.send(request('r', { ...viewer, operation: 'status-remove', statusId: 'doing' }))
  await waitFor(() => bridge.answers.size === 1)
  expect(bridge.answers.get('r')).toMatchObject({
    ok: true,
    result: { applied: true, persisted: true, reassignment: 'unknown' }
  })
  expect(useAppStore.getState().updateWorktreeMeta).toHaveBeenCalledExactlyOnceWith(
    'w-doing',
    { workspaceStatus: 'done' },
    { executionHostId: 'local' }
  )
  bridge.detach()
})

const seedWorkspaces = (): Worktree[] => [
  makeWorktree('repo::/todo', 'todo'),
  makeWorktree('repo::/doing', 'doing'),
  { ...makeWorktree('ssh-repo::/remote', 'todo'), repoId: 'ssh-repo', hostId: 'ssh:box' }
]
const seedBoard = (worktrees: Worktree[], syncEnabled = false): void => {
  const byRepo: Record<string, Worktree[]> = {}
  for (const worktree of worktrees) {
    byRepo[worktree.repoId] = [...(byRepo[worktree.repoId] ?? []), worktree]
  }
  // The status tests above reorder and remove statuses in the shared store.
  const statuses = normalizeWorkspaceStatuses([
    { id: 'todo', label: 'Todo' },
    { id: 'doing', label: 'Doing' },
    { id: 'done', label: 'Done' }
  ])
  host.worktrees = worktrees
  host.storeByRepo = byRepo
  host.durable = statuses
  useAppStore.setState({
    workspaceStatuses: statuses,
    worktreesByRepo: byRepo,
    syncTaskStatusFromWorkspaceBoard: syncEnabled
  })
}
const assignRequest = (workspaceIds: string[], statusId: string): WorkspaceBoardRequest =>
  request('assign', { ...viewer, operation: 'assign', workspaceIds, statusId })
const updateBatch = () => vi.mocked(useAppStore.getState().updateWorktreesMeta)

it('moves workspaces through the real board handler, confirms the local host and sends no Linear write', async () => {
  seedBoard(seedWorkspaces())
  renderAssignableBoard()
  const bridge = attachBridge()
  bridge.send(assignRequest(['repo::/todo', 'repo::/doing'], 'doing'))
  await waitFor(() => bridge.answers.size === 1)
  expect(bridge.answers.get('assign')).toMatchObject({
    ok: true,
    result: {
      dispatched: true,
      applied: true,
      persisted: true,
      assignment: {
        statusId: 'doing',
        workspaces: [
          { workspaceId: 'repo::/todo', changed: true, hostWrite: 'confirmed' },
          { workspaceId: 'repo::/doing', changed: false, hostWrite: 'not_requested' }
        ],
        taskStatusSync: 'not_requested'
      }
    }
  })
  expect(updateBatch()).toHaveBeenCalledExactlyOnceWith([
    { worktreeId: 'repo::/todo', updates: { workspaceStatus: 'doing' }, executionHostId: 'local' }
  ])
  expect(useAppStore.getState().recordFeatureInteraction).toHaveBeenCalledExactlyOnceWith(
    'workspace-board-actions'
  )
  expect(linear.sync).not.toHaveBeenCalled()
  expect(linear.getIssue).not.toHaveBeenCalled()
  expect(linear.updateIssue).not.toHaveBeenCalled()
  bridge.detach()
})
it('asks the board to sync task statuses when the board setting is on, and reports only the request', async () => {
  seedBoard(seedWorkspaces(), true)
  renderAssignableBoard()
  const bridge = attachBridge()
  bridge.send(assignRequest(['repo::/todo'], 'doing'))
  await waitFor(() => bridge.answers.size === 1)
  expect(bridge.answers.get('assign')).toMatchObject({
    ok: true,
    result: { applied: true, persisted: true, assignment: { taskStatusSync: 'requested' } }
  })
  expect(linear.sync).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      worktreeIds: ['repo::/todo'],
      targetStatus: expect.objectContaining({ id: 'doing' })
    })
  )
  expect(linear.getIssue).not.toHaveBeenCalled()
  expect(linear.updateIssue).not.toHaveBeenCalled()
  bridge.detach()
})
it('leaves an SSH workspace unverifiable and never lists its host', async () => {
  seedBoard(seedWorkspaces())
  renderAssignableBoard()
  const bridge = attachBridge()
  bridge.send(assignRequest(['ssh-repo::/remote'], 'done'))
  await waitFor(() => bridge.answers.size === 1)
  expect(bridge.answers.get('assign')).toMatchObject({
    ok: true,
    result: {
      applied: true,
      persisted: null,
      reason: 'persistence_unverifiable',
      assignment: { workspaces: [{ hostId: 'ssh:box', hostWrite: 'unverifiable' }] }
    }
  })
  expect(updateBatch()).toHaveBeenCalledExactlyOnceWith([
    {
      worktreeId: 'ssh-repo::/remote',
      updates: { workspaceStatus: 'done' },
      executionHostId: 'ssh:box'
    }
  ])
  expect(acquireLease).not.toHaveBeenCalledWith(expect.anything(), 'ssh-repo', expect.anything())
  bridge.detach()
})
it('reports a write the store swallowed and reverted as not applied and not confirmed', async () => {
  seedBoard(seedWorkspaces())
  host.failWrites = true
  renderAssignableBoard()
  const bridge = attachBridge()
  bridge.send(assignRequest(['repo::/todo'], 'done'))
  await waitFor(() => bridge.answers.size === 1)
  expect(bridge.answers.get('assign')).toMatchObject({
    ok: true,
    result: {
      applied: false,
      persisted: false,
      assignment: {
        workspaces: [{ hostWrite: 'not_confirmed' }],
        writeFailureReporting: 'swallowed_by_store'
      }
    }
  })
  bridge.detach()
})
it('refuses a project-group folder workspace, which the board never lists, before any write', async () => {
  seedBoard(seedWorkspaces())
  renderAssignableBoard()
  const bridge = attachBridge()
  bridge.send(assignRequest(['folder:0c1d'], 'done'))
  await waitFor(() => bridge.answers.size === 1)
  expect(bridge.answers.get('assign')).toMatchObject({
    ok: false,
    error: expect.stringContaining('workspace_folder_unsupported')
  })
  expect(updateBatch()).not.toHaveBeenCalled()
  bridge.detach()
})
