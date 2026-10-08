import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import type * as SshFilesystemDispatch from '../../src/main/providers/ssh-filesystem-dispatch'

const fixture = vi.hoisted(() => ({ remoteCreate: vi.fn(), remoteStat: vi.fn(), connected: true }))
vi.mock('electron', () => ({
  app: { getPath: () => '/unused-fixture', getVersion: () => 'fixture' },
  ipcMain: { handle: vi.fn() }
}))
vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
vi.mock('../../src/main/providers/ssh-filesystem-dispatch', async (original) => ({
  ...(await original<typeof SshFilesystemDispatch>()),
  requireSshFilesystemProvider: () => {
    if (!fixture.connected) {
      throw new Error('SSH provider unavailable')
    }
    return { createDir: fixture.remoteCreate, stat: fixture.remoteStat }
  }
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_HOST_PATH_HANDLERS } from '../../src/cli/handlers/workspace-host-path'
import {
  WORKSPACE_HOST_PATH_METHODS,
  setDesktopDirectoryCreateForRpc,
  setDesktopPathExistsForRpc
} from '../../src/main/runtime/rpc/methods/workspace-host-path'
import { registerFilesystemMutationHandlers } from '../../src/main/ipc/filesystem-mutations'
import { registerFilesystemReadHandlers } from '../../src/main/ipc/filesystem/filesystem-read-handlers'
import { createFilesystemHandlerContext } from '../../src/main/ipc/filesystem/filesystem-handler-context'
import { createSenderScopedRequestCancellations } from '../../src/main/ipc/sender-scoped-request-cancellation'
import { invalidateAuthorizedRootsCache } from '../../src/main/ipc/filesystem-auth'
import {
  resetSshConnectionGenerations,
  setSshConnectionGeneration
} from '../../src/main/ssh/ssh-connection-generation'

let directory: string
let root: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
async function input(value: unknown) {
  await writeFile(join(directory, 'input.json'), JSON.stringify(value))
  ctx.flags.set('params-file', 'input.json')
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-host-path-cli-'))
  root = join(directory, 'folder')
  await mkdir(root)
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
  store.addRepo({
    id: 'fixture',
    path: root,
    displayName: 'Folder',
    badgeColor: 'blue',
    addedAt: 1,
    kind: 'folder'
  })
  invalidateAuthorizedRootsCache()
  registerFilesystemMutationHandlers(store)
  registerFilesystemReadHandlers(
    createFilesystemHandlerContext(
      store,
      undefined,
      createSenderScopedRequestCancellations(),
      createSenderScopedRequestCancellations()
    )
  )
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_HOST_PATH_METHODS
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
  fixture.remoteCreate.mockReset()
  fixture.remoteStat.mockReset()
  fixture.connected = true
  setSshConnectionGeneration('fixture', 4)
})
afterEach(async () => {
  setDesktopDirectoryCreateForRpc(null)
  setDesktopPathExistsForRpc(null)
  resetSshConnectionGenerations()
  invalidateAuthorizedRootsCache()
  await store.freezeWritesAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('creates a nested directory through the desktop authority without replacing existing paths', async () => {
  const dirPath = join(root, 'nested', 'new')
  await input({ dirPath, expectedExecutionHostId: 'local' })
  await WORKSPACE_HOST_PATH_HANDLERS['file mkdir-host-path'](ctx)
  expect((await stat(dirPath)).isDirectory()).toBe(true)
  await expect(WORKSPACE_HOST_PATH_HANDLERS['file mkdir-host-path'](ctx)).rejects.toMatchObject({
    code: 'runtime_error'
  })
  expect((await stat(dirPath)).isDirectory()).toBe(true)
})

it('preserves root authorization and rejects a symlink escape before creating anything', async () => {
  const outside = join(directory, 'outside')
  await mkdir(outside)
  await symlink(outside, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
  for (const dirPath of [join(outside, 'direct'), join(root, 'escape', 'indirect')]) {
    await input({ dirPath, expectedExecutionHostId: 'local' })
    await expect(WORKSPACE_HOST_PATH_HANDLERS['file mkdir-host-path'](ctx)).rejects.toMatchObject({
      code: 'runtime_error'
    })
  }
  await expect(stat(join(outside, 'direct'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(stat(join(outside, 'indirect'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(console.log).not.toHaveBeenCalled()
})

it('checks an absolute host path and distinguishes missing from denied', async () => {
  const filePath = join(root, 'notes.md')
  await writeFile(filePath, 'host-data-canary')
  await input({ filePath })
  await WORKSPACE_HOST_PATH_HANDLERS['file host-path-exists'](ctx)
  expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result).toBe(true)
  await input({ filePath: join(root, 'absent') })
  await WORKSPACE_HOST_PATH_HANDLERS['file host-path-exists'](ctx)
  expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result).toBe(false)
  const count = vi.mocked(console.log).mock.calls.length
  await input({ filePath: join(directory, 'not-authorized') })
  await expect(WORKSPACE_HOST_PATH_HANDLERS['file host-path-exists'](ctx)).rejects.toMatchObject({
    code: 'runtime_error'
  })
  expect(vi.mocked(console.log).mock.calls).toHaveLength(count)
  expect(await readFile(filePath, 'utf8')).toBe('host-data-canary')
})

it('uses the existing explicitly named user-file access without creating a lasting grant', async () => {
  const filePath = join(directory, 'user-file.txt')
  await writeFile(filePath, 'private-canary')
  await input({ filePath, access: { kind: 'user-file' } })
  await WORKSPACE_HOST_PATH_HANDLERS['file host-path-exists'](ctx)
  expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result).toBe(true)
  await input({ filePath })
  await expect(WORKSPACE_HOST_PATH_HANDLERS['file host-path-exists'](ctx)).rejects.toMatchObject({
    code: 'runtime_error'
  })
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private-canary')
})

it('keeps SSH generation and host guards and never falls back to a client directory', async () => {
  const remoteDir = join(directory, 'remote-effect')
  fixture.remoteCreate.mockImplementation(async (path: string) => {
    expect(path).toBe('/remote/nested')
    await mkdir(remoteDir)
  })
  const args = {
    dirPath: '/remote/nested',
    connectionId: 'fixture',
    expectedExecutionHostId: 'ssh:fixture',
    expectedSshTargetId: 'fixture',
    expectedSshConnectionGeneration: 4
  }
  await input(args)
  await WORKSPACE_HOST_PATH_HANDLERS['file mkdir-host-path'](ctx)
  expect((await stat(remoteDir)).isDirectory()).toBe(true)
  await input({ ...args, expectedSshConnectionGeneration: 3 })
  await expect(WORKSPACE_HOST_PATH_HANDLERS['file mkdir-host-path'](ctx)).rejects.toMatchObject({
    code: 'runtime_error'
  })
  await input({ ...args, expectedExecutionHostId: 'local' })
  await expect(WORKSPACE_HOST_PATH_HANDLERS['file mkdir-host-path'](ctx)).rejects.toMatchObject({
    code: 'runtime_error'
  })
  expect(fixture.remoteCreate).toHaveBeenCalledTimes(1)
  fixture.connected = false
  await input(args)
  await expect(WORKSPACE_HOST_PATH_HANDLERS['file mkdir-host-path'](ctx)).rejects.toMatchObject({
    code: 'runtime_error'
  })
  expect(fixture.remoteCreate).toHaveBeenCalledTimes(1)
})

it('does not turn SSH contact failure into a false existence result', async () => {
  await input({ filePath: '/remote/file', connectionId: 'fixture' })
  fixture.remoteStat.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
  await WORKSPACE_HOST_PATH_HANDLERS['file host-path-exists'](ctx)
  expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result).toBe(false)
  fixture.remoteStat.mockRejectedValue(new Error('contact lost'))
  const count = vi.mocked(console.log).mock.calls.length
  await expect(WORKSPACE_HOST_PATH_HANDLERS['file host-path-exists'](ctx)).rejects.toMatchObject({
    code: 'runtime_error'
  })
  expect(vi.mocked(console.log).mock.calls).toHaveLength(count)
})

it('rejects missing host expectations before RPC and missing service or old peer without fallback', async () => {
  await input({ dirPath: join(root, 'new') })
  await expect(WORKSPACE_HOST_PATH_HANDLERS['file mkdir-host-path'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(ctx.client.call).not.toHaveBeenCalled()
  await input({ filePath: join(root, 'file') })
  setDesktopPathExistsForRpc(null)
  await expect(WORKSPACE_HOST_PATH_HANDLERS['file host-path-exists'](ctx)).rejects.toMatchObject({
    code: 'runtime_unavailable'
  })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'old host')
  )
  await expect(WORKSPACE_HOST_PATH_HANDLERS['file host-path-exists'](ctx)).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(ctx.client.call).toHaveBeenCalledTimes(2)
  expect(console.log).not.toHaveBeenCalled()
})

it('rejects relative paths before RPC instead of anchoring them in either cwd', async () => {
  await input({ dirPath: 'relative', expectedExecutionHostId: 'local' })
  await expect(WORKSPACE_HOST_PATH_HANDLERS['file mkdir-host-path'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  await input({ filePath: 'relative' })
  await expect(WORKSPACE_HOST_PATH_HANDLERS['file host-path-exists'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  await input({ dirPath: join(root, 'new'), expectedExecutionHostId: 'runtime:other-profile' })
  await expect(WORKSPACE_HOST_PATH_HANDLERS['file mkdir-host-path'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(ctx.client.call).not.toHaveBeenCalled()
  await expect(stat(join(directory, 'relative'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(console.log).not.toHaveBeenCalled()
})
