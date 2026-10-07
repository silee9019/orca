import { expect, it, vi } from 'vitest'
import { accountViewerApi } from '../../src/preload/api/account-viewer-bridge'
import { registerAccountViewerBridge } from '../../src/renderer/src/runtime/account-viewer-bridge'
const bus = vi.hoisted(() => {
  const main = new Map<string, Set<(e: unknown, p: unknown) => void>>()
  const preload = new Map<string, (e: unknown, p: unknown) => void>()
  const renderer = { send: vi.fn((c: string, p: unknown) => preload.get(c)?.({}, p)) }
  return {
    main,
    preload,
    renderer,
    available: true,
    resource: vi.fn(async (x: unknown) => ({ applied: x })),
    usage: vi.fn(async () => ({ usage: true })),
    account: vi.fn(async () => ({ account: true }))
  }
})
vi.mock('electron', () => ({
  ipcMain: {
    on: (c: string, l: (e: unknown, p: unknown) => void) => {
      const listeners = bus.main.get(c) ?? new Set()
      listeners.add(l)
      bus.main.set(c, listeners)
    },
    removeListener: (c: string, l: (e: unknown, p: unknown) => void) => {
      bus.main.get(c)?.delete(l)
    }
  },
  ipcRenderer: {
    on: (c: string, l: (e: unknown, p: unknown) => void) => bus.preload.set(c, l),
    removeListener: (c: string) => bus.preload.delete(c),
    send: (c: string, p: unknown) => {
      for (const l of bus.main.get(c) ?? []) {
        l({ sender: bus.renderer }, p)
      }
    }
  }
}))
vi.mock('../../src/main/ipc/ui', () => ({
  getTrustedUIRendererWebContents: () => (bus.available ? bus.renderer : null)
}))

vi.mock('../../src/renderer/src/runtime/usage-viewer-actions', () => ({
  applyUsageViewerAction: bus.usage
}))
vi.mock('../../src/renderer/src/runtime/accounts-viewer-actions', () => ({
  applyAccountsViewerAction: bus.account
}))

import {
  attachResourceManagerViewerController,
  type ResourceManagerViewerController
} from '../../src/renderer/src/runtime/resource-manager-viewer-actions'
import { parseArgs } from '../../src/cli/args'
import { RESOURCE_MANAGER_COMMAND_SPECS } from '../../src/cli/specs/resource-manager'
import { RESOURCE_MANAGER_HANDLERS } from '../../src/cli/handlers/resource-manager'
import { RESOURCE_MANAGER_METHODS } from '../../src/main/runtime/rpc/methods/resource-manager'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { buildRegistry, type RpcContext } from '../../src/main/runtime/rpc/core'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
vi.mock('../../src/renderer/src/components/shared/kill-all-terminal-surfaces', () => ({
  snapshotKillAllTerminalSurfaceIds: () => ['tab-1']
}))
vi.mock('../../src/renderer/src/components/status-bar/mergeSnapshotAndSessions', () => ({
  UNATTRIBUTED_REPO_ID: 'unattributed'
}))
let disposeController = () => {}
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
  disposeController = attachResourceManagerViewerController(controller)
  return { controller, row, c }
}

it('parses CLI through RPC and trusted renderer into the same resource controller with confirmation before effects', async () => {
  const { controller } = fixture()
  const unsubs: (() => void)[] = []
  registerAccountViewerBridge(accountViewerApi, unsubs)
  const directory = await mkdtemp(join(tmpdir(), 'orca-resource-fixture-'))
  const path = join(directory, 'action.json')
  const client = new RuntimeClient(directory, 1000, null, null)
  const registry = buildRegistry(RESOURCE_MANAGER_METHODS)
  const context: RpcContext = { runtime: vi.fn<() => RpcContext['runtime']>()() }
  const calls = vi.spyOn(client, 'call').mockImplementation(async (name, input) => {
    const method = registry.get(name)
    if (!method || 'stream' in method) {
      throw new Error('missing RPC')
    }
    return {
      ok: true,
      id: 'fixture',
      _meta: { runtimeId: 'fixture' },
      result: await method.handler(method.params?.parse(input), context)
    }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const run = async (action: unknown) => {
    await writeFile(path, JSON.stringify(action))
    const parsed = parseArgs(
      ['resource-manager', 'apply', '--viewer', 'desktop', '--request-file', path, '--json'],
      RESOURCE_MANAGER_COMMAND_SPECS.map((s) => s.path),
      RESOURCE_MANAGER_COMMAND_SPECS
    )
    await RESOURCE_MANAGER_HANDLERS[parsed.commandPath.join(' ')]({
      client,
      flags: parsed.flags,
      json: true,
      cwd: directory
    })
  }
  try {
    await expect(
      run({ action: 'confirm-kill', sessionId: 'ssh-session', pid: 123 })
    ).rejects.toThrow()
    expect(calls).not.toHaveBeenCalled()
    expect(controller.runKillConfirmed).not.toHaveBeenCalled()
    await run({ action: 'set-sort', sort: 'cpu' })
    expect(controller.setSortOption).toHaveBeenCalledExactlyOnceWith('cpu')
    await run({ action: 'prepare-kill', sessionId: 'ssh-session', pid: 123 })
    expect(controller.navigateToTab).not.toHaveBeenCalled()
    controller.killing = true
    await run({ action: 'dismiss-kill' })
    expect(controller.killConfirm?.sessionId).toBe('ssh-session')
    await expect(run({ action: 'cancel-kill' })).rejects.toThrow('resource_kill_busy')
    controller.killing = false
    await run({ action: 'dismiss-kill' })
    expect(controller.killConfirm).toBeNull()
    await run({ action: 'navigate-session', sessionId: 'ssh-session' })
    expect(controller.navigateToTab).toHaveBeenCalledExactlyOnceWith('tab-1', 'tab-1:leaf')
    await run({ action: 'prepare-kill', sessionId: 'ssh-session', pid: 123 })
    controller.daemonUnreachable = true
    await run({ action: 'confirm-kill', sessionId: 'ssh-session', pid: 123, confirm: true })
    expect(controller.runKillConfirmed).toHaveBeenCalledOnce()
    await writeFile(path, ' '.repeat(65537))
    const parsed = parseArgs(
      ['resource-manager', 'apply', '--viewer', 'desktop', '--request-file', path],
      RESOURCE_MANAGER_COMMAND_SPECS.map((s) => s.path),
      RESOURCE_MANAGER_COMMAND_SPECS
    )
    const prior = calls.mock.calls.length
    await expect(
      RESOURCE_MANAGER_HANDLERS['resource-manager apply']({
        client,
        flags: parsed.flags,
        json: true,
        cwd: directory
      })
    ).rejects.toThrow('bounded')
    expect(calls.mock.calls.length).toBe(prior)
  } finally {
    disposeController()
    unsubs.forEach((f) => f())
    vi.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  }
})
