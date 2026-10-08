import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import type * as EditorLaunch from '../../src/main/external-editor-launch'
const fixture = vi.hoisted(() => ({ reveal: vi.fn(), launch: vi.fn() }))
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  shell: { showItemInFolder: fixture.reveal },
  dialog: { showOpenDialog: vi.fn() }
}))
vi.mock('../../src/main/external-editor-launch', async (original) => ({
  ...(await original<typeof EditorLaunch>()),
  launchExternalEditor: fixture.launch
}))
vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_SHELL_ACTION_HANDLERS } from '../../src/cli/handlers/workspace-shell-actions'
import {
  WORKSPACE_SHELL_ACTION_METHODS,
  setDesktopShellActionsForRpc
} from '../../src/main/runtime/rpc/methods/workspace-shell-actions'
import { registerShellHandlers } from '../../src/main/ipc/shell'
let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
let runtime: OrcaRuntimeService
function lastResult() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-shell-cli-'))
  vi.spyOn(appEnvironment, 'getAppEnvironment').mockReturnValue({
    getPath: () => directory,
    getAppPath: () => directory,
    getVersion: () => 'fixture',
    isPackaged: () => false,
    onWillQuit: () => {},
    exit: () => {},
    getAppMetrics: () => []
  })
  authority = new ProfileStateSqliteAuthority(join(directory, 'profile.db'), 'fixture')
  vi.spyOn(authority, 'scheduleBackup').mockImplementation(() => {})
  store = new Store({ dataFile: join(directory, 'data.json'), profileStateAuthority: authority })
  fixture.reveal.mockReset()
  fixture.launch.mockReset()
  fixture.launch.mockResolvedValue(undefined)
  runtime = new OrcaRuntimeService(store)
  registerShellHandlers(store)
  const dispatcher = new RpcDispatcher({
    runtime,
    methods: WORKSPACE_SHELL_ACTION_METHODS
  })
  const client = new RuntimeClient('different-client-profile')
  vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
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
  ctx = { client, cwd: directory, json: true, flags: new Map() }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(async () => {
  setDesktopShellActionsForRpc(null)
  await store.freezeWritesAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

async function invoke(command: string, params: object, confirm = true): Promise<void> {
  const file = join(directory, 'input.json')
  await writeFile(file, JSON.stringify(params))
  ctx.flags.set('params-file', file)
  if (confirm) {
    ctx.flags.set('confirm', join(directory, 'target folder'))
  } else {
    ctx.flags.delete('confirm')
  }
  await WORKSPACE_SHELL_ACTION_HANDLERS[command](ctx)
}
it('reveals an existing native folder using the original validated desktop action', async () => {
  const path = join(directory, 'target folder')
  await writeFile(path, 'unchanged')
  await invoke('shell reveal', { path, expectedExecutionHostId: 'local' })
  expect(lastResult()).toEqual({ ok: true })
  expect(fixture.reveal).toHaveBeenCalledWith(path)
  expect(await readFile(path, 'utf8')).toBe('unchanged')
  expect(fixture.launch).not.toHaveBeenCalled()
})
it('uses the original editor launch specification for a native path without launching a process', async () => {
  const path = join(directory, 'target folder')
  await writeFile(path, 'unchanged')
  await invoke('shell open-editor', { path, expectedExecutionHostId: 'local', command: 'code' })
  expect(lastResult()).toEqual({ ok: true })
  expect(fixture.launch).toHaveBeenCalledWith(
    expect.objectContaining({ spawnArgs: expect.arrayContaining([path]) })
  )
  expect(fixture.reveal).not.toHaveBeenCalled()
  expect(await readFile(path, 'utf8')).toBe('unchanged')
})
it('routes an SSH path to the configured VSCode authority without checking the native filesystem', async () => {
  const path = '/remote/fixture'
  ctx.flags.set('confirm', path)
  vi.spyOn(store, 'getSshTarget').mockReturnValue({
    id: 'fixture',
    label: 'Fixture',
    host: 'fixture.invalid',
    port: 22,
    username: 'fixture',
    source: 'ssh-config',
    configHost: 'fixture-alias'
  })
  const file = join(directory, 'input.json')
  await writeFile(
    file,
    JSON.stringify({
      path,
      expectedExecutionHostId: 'local',
      connectionId: 'fixture',
      command: 'code'
    })
  )
  ctx.flags.set('params-file', file)
  await WORKSPACE_SHELL_ACTION_HANDLERS['shell open-editor'](ctx)
  expect(fixture.launch).toHaveBeenCalledWith(
    expect.objectContaining({ spawnArgs: expect.arrayContaining(['ssh-remote+fixture-alias']) })
  )
  expect(fixture.reveal).not.toHaveBeenCalled()
})
it('rejects missing confirmation, wrong host and missing paths without invoking OS actions', async () => {
  const path = join(directory, 'target folder')
  await expect(
    invoke('shell reveal', { path, expectedExecutionHostId: 'local' }, false)
  ).rejects.toThrow()
  for (const params of [
    { path, expectedExecutionHostId: 'ssh:fixture' },
    { path: 'relative', expectedExecutionHostId: 'local' },
    { path, expectedExecutionHostId: 'local' }
  ]) {
    await expect(invoke('shell reveal', params)).rejects.toThrow()
  }
  expect(fixture.reveal).not.toHaveBeenCalled()
  expect(fixture.launch).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})
it('preserves active remote-runtime rejection and sanitized launch failures', async () => {
  const path = join(directory, 'target folder')
  await writeFile(path, 'unchanged')
  vi.spyOn(store, 'getSettings').mockReturnValue({
    ...store.getSettings(),
    activeRuntimeEnvironmentId: 'fixture-runtime'
  })
  await expect(invoke('shell reveal', { path, expectedExecutionHostId: 'local' })).rejects.toThrow(
    /remote-runtime-unsupported/
  )
  vi.mocked(store.getSettings).mockRestore()
  fixture.launch.mockRejectedValue(new Error('private-launch-canary'))
  await expect(
    invoke('shell open-editor', { path, expectedExecutionHostId: 'local', command: 'code' })
  ).rejects.toThrow(/launch-failed/)
  expect(fixture.reveal).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})
it('fails on absent desktop services and old peers without invoking the OS', async () => {
  const path = join(directory, 'target folder')
  setDesktopShellActionsForRpc(null)
  await expect(
    invoke('shell reveal', { path, expectedExecutionHostId: 'local' })
  ).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(
    invoke('shell open-editor', { path, expectedExecutionHostId: 'local' })
  ).rejects.toMatchObject({ code: 'method_not_found' })
  expect(fixture.launch).not.toHaveBeenCalled()
  expect(fixture.reveal).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})
