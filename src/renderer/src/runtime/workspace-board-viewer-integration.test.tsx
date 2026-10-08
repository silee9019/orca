// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Worktree, WorkspaceStatusDefinition } from '../../../shared/worktree/types'
import type { WorkspaceBoardRequest } from '../../../shared/workspace-board-command'

const host = vi.hoisted(() => {
  const noStatuses = (): unknown[] => []
  return { durable: noStatuses() }
})
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
    recordFeatureInteraction: vi.fn(),
    updateWorktreeMeta: vi.fn(async () => undefined),
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
      control: {
        addStatus: actions.handleAddStatus,
        renameStatus: actions.handleRenameStatus,
        changeStatusColor: actions.handleChangeStatusColor,
        changeStatusIcon: actions.handleChangeStatusIcon,
        moveStatus: actions.handleMoveStatus,
        removeStatus: actions.handleRemoveStatus,
        setColumnWidth: setWidth
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
