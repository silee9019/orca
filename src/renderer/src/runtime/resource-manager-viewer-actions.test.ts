import { afterEach, expect, it, vi } from 'vitest'
import {
  applyResourceManagerViewerAction,
  attachResourceManagerViewerController,
  type ResourceManagerViewerController
} from './resource-manager-viewer-actions'
const surfaces = vi.hoisted(() => ({ ids: ['tab-1'] }))
vi.mock('../components/shared/kill-all-terminal-surfaces', () => ({
  snapshotKillAllTerminalSurfaceIds: () => surfaces.ids
}))
vi.mock('../components/status-bar/mergeSnapshotAndSessions', () => ({
  UNATTRIBUTED_REPO_ID: 'unattributed'
}))
let cleanup = (): void => {}
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
function fixture() {
  const row = {
    sessionId: 'ssh-session',
    pid: 123,
    tabId: 'tab-1',
    paneKey: 'tab-1:leaf',
    bound: true,
    agentOwnership: 'unknown' as const,
    label: 'fixture',
    cpu: null,
    memory: null,
    hasLocalSamples: false
  }
  const c = {
    open: true,
    sortOption: 'memory',
    appCollapsed: true,
    collapsedRepos: new Set<string>(),
    collapsedWorktrees: new Set<string>(),
    activeWorktreeId: 'folder:fixture',
    killConfirm: null,
    killing: false,
    resourceSnapshot: null,
    daemonUnreachable: false,
    sessionsOnlyError: false,
    unifiedRepos: [
      { repoId: 'repo-1', worktrees: [{ worktreeId: 'folder:fixture', sessions: [row] }] }
    ],
    sessionInventory: {
      sessions: [{ id: 'orphan-1', cwd: '/', title: 'fixture', agentOwnership: 'absent' }]
    },
    resourceSessionBindings: { tabsByWorktree: {}, ptyIdsByTabId: {}, workspaceSessionReady: true },
    workspaceSessionReady: true,
    setOpen: vi.fn((value: boolean) => {
      c.open = value
    }),
    setSortOption: vi.fn((value: string) => {
      c.sortOption = value
    }),
    setAppCollapsed: vi.fn((value: boolean) => {
      c.appCollapsed = value
    }),
    recordFeatureInteraction: vi.fn(),
    toggleRepo: vi.fn((id: string) => c.collapsedRepos.add(id)),
    toggleWorktree: vi.fn((id: string) => c.collapsedWorktrees.add(id)),
    navigateToWorktree: vi.fn(),
    navigateToTab: vi.fn(),
    deleteWorktree: vi.fn(),
    handleOpenWorkspaceCleanup: vi.fn(),
    openSpaceResults: vi.fn(),
    setKillConfirm: vi.fn(),
    runKillConfirmed: vi.fn(async () => {}),
    handleKillOrphans: vi.fn(async () => {}),
    daemonActions: {
      pending: null,
      isBusy: false,
      setPending: vi.fn(),
      runRestart: vi.fn(async () => {}),
      runKillAll: vi.fn(async () => {})
    }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the adapter reads only this fixture's explicit properties; no React controller or native service is constructed.
  const controller = c as unknown as ResourceManagerViewerController
  controller.setKillConfirm = vi.fn((value) => {
    controller.killConfirm = typeof value === 'function' ? value(controller.killConfirm) : value
  })
  controller.daemonActions.setPending = vi.fn((value) => {
    controller.daemonActions.pending = value
  })
  cleanup = attachResourceManagerViewerController(controller)
  return { controller, row, c }
}
it('changes the existing controller state and reports the same collapsed selections', async () => {
  const { controller } = fixture()
  await applyResourceManagerViewerAction({ action: 'set-sort', sort: 'cpu' })
  await applyResourceManagerViewerAction({ action: 'toggle-repo', repoId: 'repo-1' })
  await applyResourceManagerViewerAction({
    action: 'toggle-worktree',
    worktreeId: 'folder:fixture'
  })
  expect(await applyResourceManagerViewerAction({ action: 'status' })).toMatchObject({
    sort: 'cpu',
    collapsedRepoIds: ['repo-1'],
    collapsedWorktreeIds: ['folder:fixture']
  })
  expect(controller.setSortOption).toHaveBeenCalledExactlyOnceWith('cpu')
  await expect(
    applyResourceManagerViewerAction({ action: 'toggle-worktree', worktreeId: 'missing' })
  ).rejects.toThrow('unavailable')
})
it('requires the same prepared session id and pid before requesting its existing kill flow', async () => {
  const { controller } = fixture()
  await expect(
    applyResourceManagerViewerAction({
      action: 'confirm-kill',
      sessionId: 'ssh-session',
      pid: 123,
      confirm: true
    })
  ).rejects.toThrow('confirmation_changed')
  expect(controller.runKillConfirmed).not.toHaveBeenCalled()
  await applyResourceManagerViewerAction({
    action: 'prepare-kill',
    sessionId: 'ssh-session',
    pid: 123
  })
  await expect(
    applyResourceManagerViewerAction({
      action: 'confirm-kill',
      sessionId: 'ssh-session',
      pid: 124,
      confirm: true
    })
  ).rejects.toThrow('session_changed')
  expect(
    await applyResourceManagerViewerAction({
      action: 'confirm-kill',
      sessionId: 'ssh-session',
      pid: 123,
      confirm: true
    })
  ).toMatchObject({ settled: true, verdict: 'unverifiable' })
  expect(controller.runKillConfirmed).toHaveBeenCalledOnce()
})
it('refuses changed orphan/surface sets and preserves the daemon confirmation gate', async () => {
  const { controller } = fixture()
  await expect(
    applyResourceManagerViewerAction({
      action: 'kill-orphans',
      expectedSessionIds: [],
      confirm: true
    })
  ).rejects.toThrow('orphan_set_changed')
  expect(controller.handleKillOrphans).not.toHaveBeenCalled()
  await applyResourceManagerViewerAction({
    action: 'kill-orphans',
    expectedSessionIds: ['orphan-1'],
    confirm: true
  })
  expect(controller.handleKillOrphans).toHaveBeenCalledOnce()
  await applyResourceManagerViewerAction({ action: 'prepare-daemon', kind: 'restart' })
  await expect(
    applyResourceManagerViewerAction({
      action: 'confirm-daemon',
      kind: 'restart',
      expectedSurfaceIds: [],
      confirm: true
    })
  ).rejects.toThrow('surface_set_changed')
  expect(controller.daemonActions.runRestart).not.toHaveBeenCalled()
  await applyResourceManagerViewerAction({
    action: 'confirm-daemon',
    kind: 'restart',
    expectedSurfaceIds: ['tab-1'],
    confirm: true
  })
  expect(controller.daemonActions.runRestart).toHaveBeenCalledOnce()
})
it('targets the existing folder/session navigation and never deletes without explicit confirmation', async () => {
  const { controller } = fixture()
  await applyResourceManagerViewerAction({
    action: 'navigate-worktree',
    worktreeId: 'folder:fixture'
  })
  expect(controller.navigateToWorktree).toHaveBeenCalledExactlyOnceWith('folder:fixture')
  await applyResourceManagerViewerAction({ action: 'navigate-session', sessionId: 'ssh-session' })
  expect(controller.navigateToTab).toHaveBeenCalledExactlyOnceWith('tab-1', 'tab-1:leaf')
  await expect(
    applyResourceManagerViewerAction({ action: 'delete-worktree', worktreeId: 'folder:fixture' })
  ).rejects.toThrow()
  expect(controller.deleteWorktree).not.toHaveBeenCalled()
})

it.each([true, false, null])(
  'reads exact execution-host liveness after the existing kill flow: %s',
  async (alive) => {
    const { controller } = fixture()
    const hasPty = vi.fn(async () => alive)
    vi.stubGlobal('window', { api: { pty: { hasPty } } })
    await applyResourceManagerViewerAction({
      action: 'prepare-kill',
      sessionId: 'ssh-session',
      pid: 123
    })
    expect(
      await applyResourceManagerViewerAction({
        action: 'confirm-kill',
        sessionId: 'ssh-session',
        pid: 123,
        confirm: true
      })
    ).toMatchObject({
      verdict: alive === true ? 'live' : alive === false ? 'exited' : 'unverifiable'
    })
    expect(hasPty).toHaveBeenCalledExactlyOnceWith('ssh-session')
    expect(controller.runKillConfirmed).toHaveBeenCalledOnce()
  }
)

it('preserves a busy kill dialog on dismissal and rejects cancellation, then closes an idle dialog', async () => {
  const { controller } = fixture()
  await applyResourceManagerViewerAction({
    action: 'prepare-kill',
    sessionId: 'ssh-session',
    pid: 123
  })
  expect(controller.navigateToTab).not.toHaveBeenCalled()
  controller.killing = true
  expect(await applyResourceManagerViewerAction({ action: 'dismiss-kill' })).toMatchObject({
    prevented: true
  })
  expect(controller.killConfirm?.sessionId).toBe('ssh-session')
  await expect(applyResourceManagerViewerAction({ action: 'cancel-kill' })).rejects.toThrow(
    'resource_kill_busy'
  )
  controller.killing = false
  expect(await applyResourceManagerViewerAction({ action: 'dismiss-kill' })).toMatchObject({
    prevented: false
  })
  expect(controller.killConfirm).toBeNull()
})

it('rejects multiple mounted resource owners and removes only the unmounted owner', async () => {
  const first = fixture().controller
  const detachFirst = cleanup
  const second = fixture().controller
  const detachSecond = cleanup
  try {
    await expect(
      applyResourceManagerViewerAction({ action: 'set-open', open: false })
    ).rejects.toThrow('resource_manager_ambiguous')
    expect(first.setOpen).not.toHaveBeenCalled()
    expect(second.setOpen).not.toHaveBeenCalled()
    detachFirst()
    await applyResourceManagerViewerAction({ action: 'set-open', open: false })
    expect(second.setOpen).toHaveBeenCalledExactlyOnceWith(false)
    detachFirst()
    await applyResourceManagerViewerAction({ action: 'status' })
    detachSecond()
    await expect(applyResourceManagerViewerAction({ action: 'status' })).rejects.toThrow(
      'resource_manager_unavailable'
    )
  } finally {
    detachFirst()
    detachSecond()
  }
})
