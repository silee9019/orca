import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { constants } from 'node:fs'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import type * as SshFilesystemDispatch from '../../src/main/providers/ssh-filesystem-dispatch'

const fixture = vi.hoisted(() => {
  const state: { remote: unknown; connected: boolean } = { remote: null, connected: true }
  return state
})
vi.mock('electron', () => ({
  app: { getPath: () => '/unused-fixture', getVersion: () => 'fixture' },
  ipcMain: { handle: vi.fn() }
}))
vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
vi.mock('../../src/main/ipc/ssh', () => ({
  getSshConnectionManager: () => ({
    getConnection: (id: string) =>
      id === 'fixture' && fixture.connected
        ? { getState: () => ({ status: 'connected' }) }
        : undefined
  })
}))
vi.mock('../../src/main/providers/ssh-filesystem-dispatch', async (original) => ({
  ...(await original<typeof SshFilesystemDispatch>()),
  requireSshFilesystemProvider: () => {
    if (!fixture.connected) {
      throw new Error('SSH provider unavailable')
    }
    return fixture.remote
  }
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_EXTERNAL_PATH_IMPORT_HANDLERS } from '../../src/cli/handlers/workspace-external-path-import'
import {
  WORKSPACE_EXTERNAL_PATH_IMPORT_METHODS,
  setDesktopExternalPathImportForRpc
} from '../../src/main/runtime/rpc/methods/workspace-external-path-import'
import { registerFilesystemMutationHandlers } from '../../src/main/ipc/filesystem-mutations'
import { invalidateAuthorizedRootsCache } from '../../src/main/ipc/filesystem-auth'
import {
  resetSshConnectionGenerations,
  setSshConnectionGeneration
} from '../../src/main/ssh/ssh-connection-generation'

let directory: string
let root: string
let remote: string
let sources: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
let uploads: string[]
async function run(command: string, value: object, confirm?: string) {
  await writeFile(join(directory, 'input.json'), JSON.stringify(value))
  ctx.flags = new Map([['params-file', 'input.json']])
  if (confirm) {
    ctx.flags.set('confirm', confirm)
  }
  await WORKSPACE_EXTERNAL_PATH_IMPORT_HANDLERS[command](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
const importFrom = (extra: object = {}) => ({
  sourcePaths: [join(sources, 'one.bin')],
  destDir: root,
  expectedExecutionHostId: 'local',
  ...extra
})
const ssh = {
  connectionId: 'fixture',
  expectedExecutionHostId: 'ssh:fixture',
  expectedSshTargetId: 'fixture',
  expectedSshConnectionGeneration: 4
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-external-import-cli-'))
  root = join(directory, 'folder')
  remote = join(directory, 'remote')
  sources = join(directory, 'sources')
  uploads = []
  await Promise.all([mkdir(root), mkdir(remote), mkdir(sources)])
  await writeFile(join(sources, 'one.bin'), Buffer.from([0, 1, 2, 255]))
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
  fixture.connected = true
  // Why: the private remote host is a real directory so uploads leave inspectable bytes.
  fixture.remote = {
    stat: async (path: string) => {
      const stats = await stat(path)
      return { size: stats.size, type: stats.isDirectory() ? 'directory' : 'file', mtime: 0 }
    },
    createDir: (path: string) => mkdir(path, { recursive: true }),
    createDirNoClobber: (path: string) => mkdir(path),
    deletePath: (path: string) => rm(path, { recursive: true, force: true }),
    writeFile: (path: string, content: string) => writeFile(path, content),
    openFileUploadSession: async () => ({
      uploadFile: async (source: string, destination: string) => {
        uploads.push(destination)
        await copyFile(source, destination, constants.COPYFILE_EXCL)
      },
      close: () => {}
    })
  }
  registerFilesystemMutationHandlers(store)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_EXTERNAL_PATH_IMPORT_METHODS
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
  setSshConnectionGeneration('fixture', 4)
})
afterEach(async () => {
  setDesktopExternalPathImportForRpc(null)
  resetSshConnectionGenerations()
  invalidateAuthorizedRootsCache()
  await store.freezeWritesAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('copies a file and a nested folder into an authorized root without overwriting existing names', async () => {
  await mkdir(join(sources, 'tree', 'nested'), { recursive: true })
  await writeFile(join(sources, 'tree', 'nested', 'deep.txt'), '한글 deep')
  await writeFile(join(root, 'one.bin'), 'existing')
  const result = await run(
    'file import-external-paths',
    importFrom({ sourcePaths: [join(sources, 'one.bin'), join(sources, 'tree')] }),
    root
  )
  expect(result.results.map((item: { status: string }) => item.status)).toEqual([
    'imported',
    'imported'
  ])
  expect(result.results[0]).toMatchObject({ renamed: true, kind: 'file' })
  expect(await readFile(join(root, 'one.bin'), 'utf8')).toBe('existing')
  expect(await readFile(result.results[0].destPath)).toEqual(Buffer.from([0, 1, 2, 255]))
  expect(await readFile(join(root, 'tree', 'nested', 'deep.txt'), 'utf8')).toBe('한글 deep')
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('deep')
})

it('skips symbolic links and missing sources per item and refuses destinations outside the roots', async () => {
  await symlink(join(sources, 'one.bin'), join(sources, 'link.bin'))
  const result = await run(
    'file import-external-paths',
    importFrom({ sourcePaths: [join(sources, 'link.bin'), join(sources, 'absent.bin')] }),
    root
  )
  expect(result.results).toEqual([
    { sourcePath: join(sources, 'link.bin'), status: 'skipped', reason: 'symlink' },
    { sourcePath: join(sources, 'absent.bin'), status: 'skipped', reason: 'missing' }
  ])
  expect(await readdir(root)).toEqual([])
  const outside = join(directory, 'outside')
  await mkdir(outside)
  const count = vi.mocked(console.log).mock.calls.length
  await expect(
    run('file import-external-paths', importFrom({ destDir: outside }), outside)
  ).rejects.toMatchObject({ code: 'runtime_error' })
  expect(await readdir(outside)).toEqual([])
  expect(vi.mocked(console.log).mock.calls).toHaveLength(count)
})

it('uploads through the existing SSH session only with the matching target, generation and host', async () => {
  const destDir = join(remote, 'dest')
  await mkdir(destDir)
  const request = importFrom({ ...ssh, destDir })
  const result = await run('file import-external-paths', request, destDir)
  expect(result.results[0]).toMatchObject({
    status: 'imported',
    destPath: join(destDir, 'one.bin')
  })
  expect(await readFile(join(destDir, 'one.bin'))).toEqual(Buffer.from([0, 1, 2, 255]))
  expect(await readdir(root)).toEqual([])
  for (const stale of [
    { expectedSshConnectionGeneration: 3 },
    { expectedExecutionHostId: 'local' },
    { expectedSshTargetId: 'other' }
  ]) {
    await expect(
      run('file import-external-paths', { ...request, ...stale }, destDir)
    ).rejects.toMatchObject({ code: 'runtime_error' })
  }
  expect(uploads).toHaveLength(1)
  fixture.connected = false
  await expect(run('file import-external-paths', request, destDir)).rejects.toMatchObject({
    code: 'runtime_error'
  })
  expect(uploads).toHaveLength(1)
  expect(await readdir(root)).toEqual([])
})

it('passes local worktree paths through unchanged without touching the filesystem', async () => {
  const paths = [join(sources, 'one.bin'), join(sources, 'absent.bin')]
  const result = await run('file resolve-dropped-paths', {
    paths,
    worktreePath: root,
    expectedExecutionHostId: 'local'
  })
  expect(result).toEqual({ resolvedPaths: paths, skipped: [], failed: [] })
  expect(await readdir(root)).toEqual([])
})

it('stages SSH drops under .orca/drops and reports skipped sources in input order', async () => {
  const worktree = join(remote, 'worktree')
  await mkdir(worktree)
  const request = {
    paths: [join(sources, 'one.bin'), join(sources, 'absent.bin')],
    worktreePath: worktree,
    ...ssh
  }
  await expect(run('file resolve-dropped-paths', request)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  const result = await run('file resolve-dropped-paths', request, worktree)
  expect(result).toEqual({
    resolvedPaths: [join(worktree, '.orca', 'drops', 'one.bin')],
    skipped: [{ sourcePath: join(sources, 'absent.bin'), reason: 'missing' }],
    failed: []
  })
  expect(await readFile(join(worktree, '.orca', 'drops', 'one.bin'))).toEqual(
    Buffer.from([0, 1, 2, 255])
  )
  expect(await readFile(join(worktree, '.orca', '.gitignore'), 'utf8')).toBe('*\n!.gitignore\n')
  await expect(
    run('file resolve-dropped-paths', { ...request, expectedSshConnectionGeneration: 3 }, worktree)
  ).rejects.toMatchObject({ code: 'runtime_error' })
})

it('rejects relative or malformed input and unconfirmed writes before RPC; old peers fail explicitly', async () => {
  for (const extra of [
    { sourcePaths: ['relative.bin'] },
    { sourcePaths: [] },
    { destDir: 'relative' },
    { expectedExecutionHostId: undefined },
    { transferId: 'renderer' },
    { senderId: 1 },
    { ensureDir: 'yes' }
  ]) {
    vi.mocked(ctx.client.call).mockClear()
    await expect(run('file import-external-paths', importFrom(extra), root)).rejects.toMatchObject({
      code: 'invalid_argument'
    })
    expect(ctx.client.call).not.toHaveBeenCalled()
  }
  await expect(run('file import-external-paths', importFrom())).rejects.toThrow()
  expect(ctx.client.call).not.toHaveBeenCalled()
  setDesktopExternalPathImportForRpc(null)
  await expect(run('file import-external-paths', importFrom(), root)).rejects.toMatchObject({
    code: 'runtime_unavailable'
  })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'old host')
  )
  await expect(run('file import-external-paths', importFrom(), root)).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(await readdir(root)).toEqual([])
})
