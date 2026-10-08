import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createDefaultWorkspaceCleanupBrowseState } from '../../src/shared/workspace-cleanup-browse-state'
import { readProfileStateDomain } from '../../src/main/persistence/profile-state/profile-state-domain-reader'
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { DelayedAuthority } from '../../src/main/persistence/loading-store/profile-state-delayed-authority-fixture'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'

vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))

let directory: string | undefined
let store: Store | undefined
let authority: DelayedAuthority | undefined
afterEach(async () => {
  await store?.freezeWritesAsync()
  vi.restoreAllMocks()
  if (directory) {
    await rm(directory, { recursive: true, force: true })
  }
})

it('persists host-qualified dismissals, preserves browse state, and clears only the selected profile', async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-cleanup-dismissals-'))
  const fixturePath = directory
  vi.spyOn(appEnvironment, 'getAppEnvironment').mockReturnValue({
    getPath: () => fixturePath,
    getAppPath: () => fixturePath,
    getVersion: () => 'fixture',
    isPackaged: () => false,
    onWillQuit: () => {},
    exit: () => {},
    getAppMetrics: () => []
  })
  const inner = new ProfileStateSqliteAuthority(join(directory, 'profile-state.db'), 'fixture')
  vi.spyOn(inner, 'scheduleBackup').mockImplementation(() => {})
  authority = new DelayedAuthority(inner)
  store = new Store({
    dataFile: join(directory, 'orca-data.json'),
    profileStateAuthority: authority
  })
  const { WORKSPACE_CLEANUP_DISMISSAL_METHODS } =
    await import('../../src/main/runtime/rpc/methods/workspace-cleanup-dismissals')
  const { WORKSPACE_CLEANUP_DISMISSAL_HANDLERS } =
    await import('../../src/cli/handlers/workspace-cleanup-dismissals')
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_CLEANUP_DISMISSAL_METHODS
  })
  const client = new RuntimeClient(join(directory, 'different-client-profile'))
  const call = vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeClientError(response.error.code, response.error.message)
    }
    return response
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const input = join(directory, 'input.json')
  const ctx = { client, cwd: directory, json: true, flags: new Map([['params-file', input]]) }
  store.updateUI({
    workspaceCleanup: { dismissals: {}, browse: createDefaultWorkspaceCleanupBrowseState() }
  })
  const before = store.getUI()
  const base = {
    worktreeId: 'repo::/same',
    dismissedAt: 1,
    fingerprint: 'fp',
    classifierVersion: 2
  }
  await writeFile(
    input,
    JSON.stringify({
      dismissals: [
        { ...base, executionHostId: 'local' },
        { ...base, executionHostId: 'ssh:fixture' }
      ]
    })
  )
  await store.flushPendingOrThrowAsync()
  const persistedBefore = readProfileStateDomain(
    join(directory, 'profile-state.db'),
    'fixture',
    'ui'
  )
  const gate = authority.pause()
  const pending = WORKSPACE_CLEANUP_DISMISSAL_HANDLERS['workspace-cleanup dismiss'](ctx)
  await gate.started.promise
  expect(console.log).not.toHaveBeenCalled()
  expect(readProfileStateDomain(join(directory, 'profile-state.db'), 'fixture', 'ui')).toEqual(
    persistedBefore
  )
  gate.finish.resolve()
  await pending

  expect(Object.keys(store.getUI().workspaceCleanup?.dismissals ?? {}).sort()).toEqual(
    ['local\0repo::/same', 'ssh:fixture\0repo::/same'].sort()
  )
  expect(store.getUI().workspaceCleanup?.browse).toEqual(before.workspaceCleanup?.browse)
  const accepted = call.mock.calls.length
  await writeFile(
    input,
    JSON.stringify({ dismissals: [{ ...base, executionHostId: 'not-a-host' }] })
  )
  await expect(
    WORKSPACE_CLEANUP_DISMISSAL_HANDLERS['workspace-cleanup dismiss'](ctx)
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).toHaveBeenCalledTimes(accepted)
  await writeFile(input, JSON.stringify({ dismissals: [], removedWorktreeIds: [base.worktreeId] }))
  await WORKSPACE_CLEANUP_DISMISSAL_HANDLERS['workspace-cleanup dismiss'](ctx)
  expect(store.getUI().workspaceCleanup?.dismissals).toEqual({})
  await writeFile(input, JSON.stringify({ dismissals: [{ ...base, executionHostId: 'local' }] }))
  await WORKSPACE_CLEANUP_DISMISSAL_HANDLERS['workspace-cleanup dismiss'](ctx)
  await expect(
    WORKSPACE_CLEANUP_DISMISSAL_HANDLERS['workspace-cleanup clear-dismissals'](ctx)
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  ctx.flags.set('confirm', 'workspace-cleanup')
  await WORKSPACE_CLEANUP_DISMISSAL_HANDLERS['workspace-cleanup clear-dismissals'](ctx)
  expect(store.getUI().workspaceCleanup?.dismissals).toEqual({})
  expect(store.getUI().workspaceCleanup?.browse).toEqual(before.workspaceCleanup?.browse)
  await store.flushPendingOrThrowAsync()
  expect(
    readProfileStateDomain(join(directory, 'profile-state.db'), 'fixture', 'ui')
  ).toMatchObject({ kind: 'value', value: { workspaceCleanup: store.getUI().workspaceCleanup } })
  await writeFile(input, JSON.stringify({ dismissals: [{ ...base, executionHostId: 'local' }] }))
  await WORKSPACE_CLEANUP_DISMISSAL_HANDLERS['workspace-cleanup dismiss'](ctx)
  const printed = vi.mocked(console.log).mock.calls.length
  authority.failNextWrite()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await expect(
    WORKSPACE_CLEANUP_DISMISSAL_HANDLERS['workspace-cleanup clear-dismissals'](ctx)
  ).rejects.toBeInstanceOf(RuntimeClientError)
  expect(console.log).toHaveBeenCalledTimes(printed)
  call.mockRejectedValueOnce(new RuntimeClientError('method_not_found', 'old host'))
  const count = call.mock.calls.length
  await expect(
    WORKSPACE_CLEANUP_DISMISSAL_HANDLERS['workspace-cleanup clear-dismissals'](ctx)
  ).rejects.toMatchObject({ code: 'method_not_found' })
  expect(call).toHaveBeenCalledTimes(count + 1)
})
