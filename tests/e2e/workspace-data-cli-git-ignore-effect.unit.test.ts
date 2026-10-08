import type * as SshFilesystemDispatch from '../../src/main/providers/ssh-filesystem-dispatch'
import {
  resetSshConnectionGenerations,
  setSshConnectionGeneration
} from '../../src/main/ssh/ssh-connection-generation'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { runProcess } from '../../src/shared/child-process/run-process'
import { checkIgnoredPaths } from '../../src/main/git/check-ignored-paths'
import { createRuntimeFileCommands } from '../../src/main/runtime/orca-runtime-files-test-harness'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { WORKSPACE_GIT_IGNORE_METHODS } from '../../src/main/runtime/rpc/methods/workspace-git-ignore'
import { WORKSPACE_GIT_IGNORE_HANDLERS } from '../../src/cli/handlers/workspace-git-ignore'
import { RuntimeClient } from '../../src/cli/runtime-client'
import type { HandlerContext } from '../../src/cli/dispatch'

vi.mock('../../src/main/ipc/filesystem-auth', () => ({
  resolveAuthorizedPath: async (path: string) => path
}))
const remote = vi.hoisted(() => ({ connected: false, files: new Map<string, string>() }))
vi.mock('../../src/main/providers/ssh-filesystem-dispatch', async (importOriginal) => ({
  ...(await importOriginal<typeof SshFilesystemDispatch>()),
  getSshFilesystemProvider: () =>
    remote.connected
      ? {
          readDir: async (path: string) =>
            remote.files.has(join(path, '.gitignore'))
              ? [{ name: '.gitignore', isDirectory: false, isSymlink: false }]
              : [],
          stat: async (path: string) => ({
            size: Buffer.byteLength(remote.files.get(path) ?? ''),
            type: 'file',
            mtime: 0
          }),
          readFile: async (path: string) => ({
            content: remote.files.get(path) ?? '',
            isBinary: false
          }),
          writeFileBase64Chunk: async (path: string, content: string, append: boolean) => {
            remote.files.set(
              path,
              `${append ? (remote.files.get(path) ?? '') : ''}${Buffer.from(content, 'base64').toString()}`
            )
          }
        }
      : undefined
}))
let directory: string | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  remote.connected = false
  remote.files.clear()
  resetSshConnectionGenerations()
  if (directory) {
    await rm(directory, { recursive: true, force: true })
  }
})

async function setup(hostId?: string) {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-ignore-effect-'))
  const cwd = directory
  const initialized = await runProcess({ program: 'git', args: ['init'], cwd, timeoutMs: 10_000 })
  expect(initialized.code, initialized.stderr).toBe(0)
  const { commands } = createRuntimeFileCommands({ path: cwd, hostId })
  const runtime = new OrcaRuntimeService()
  vi.spyOn(runtime, 'readFileExplorerDir').mockImplementation((...args) =>
    commands.readFileExplorerDir(...args)
  )
  const read = vi
    .spyOn(runtime, 'readMobileFile')
    .mockImplementation((...args) => commands.readMobileFile(...args))
  const write = vi
    .spyOn(runtime, 'writeFileExplorerFileBase64Chunk')
    .mockImplementation((...args) => commands.writeFileExplorerFileBase64Chunk(...args))
  const check = vi
    .spyOn(runtime, 'checkRuntimeGitIgnoredPaths')
    .mockImplementation(async (_worktree, paths) => checkIgnoredPaths(cwd, paths))
  const dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_GIT_IGNORE_METHODS })
  const client = new RuntimeClient(cwd)
  const call = vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    return response
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const input = join(cwd, 'input.json')
  const ctx: HandlerContext = { client, cwd, json: true, flags: new Map([['params-file', input]]) }
  const params = { worktree: 'id:fixture', folderName: 'dist', expectedExecutionHostId: 'local' }
  await writeFile(input, JSON.stringify(params))
  return { cwd, input, ctx, params, call, read, write, check }
}

it('lists host candidates and appends a confirmed pattern through the RPC and existing file service', async () => {
  const { cwd, ctx, call, write, check } = await setup()
  await mkdir(join(cwd, 'node_modules'))
  await mkdir(join(cwd, 'dist'))
  await writeFile(join(cwd, 'target'), 'a file is not a candidate')
  await writeFile(join(cwd, '.gitignore'), 'node_modules/\r\n*.log')
  await WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-candidates'](ctx)
  expect(check).toHaveBeenCalledWith('id:fixture', ['node_modules', 'dist'])
  expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('dist'))
  await expect(WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-folder'](ctx)).rejects.toThrow('--confirm')
  expect(call).toHaveBeenCalledTimes(1)
  ctx.flags.set('confirm', 'id:fixture:dist')
  await WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-folder'](ctx)
  expect(await readFile(join(cwd, '.gitignore'), 'utf8')).toBe('node_modules/\r\n*.log\ndist/\n')
  expect(await checkIgnoredPaths(cwd, ['dist'])).toEqual(['dist'])
  await WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-folder'](ctx)
  expect(write).toHaveBeenCalledTimes(1)
  expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('"changed": false'))
})

it('creates a missing ignore file and rejects wrong-host, truncated and unreadable input without a write', async () => {
  const { cwd, input, ctx, params, read, write } = await setup()
  ctx.flags.set('confirm', 'id:fixture:dist')
  await writeFile(input, JSON.stringify({ ...params, expectedExecutionHostId: 'ssh:other' }))
  await expect(WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-folder'](ctx)).rejects.toThrow(
    'host changed'
  )
  await expect(readFile(join(cwd, '.gitignore'))).rejects.toMatchObject({ code: 'ENOENT' })
  await writeFile(input, JSON.stringify(params))
  await WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-folder'](ctx)
  expect(await readFile(join(cwd, '.gitignore'), 'utf8')).toBe('dist/\n')
  write.mockClear()
  read.mockResolvedValueOnce({
    worktree: 'fixture',
    relativePath: '.gitignore',
    content: '',
    truncated: true,
    byteLength: 1_000_000
  })
  await expect(WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-folder'](ctx)).rejects.toThrow(
    'read limit'
  )
  read.mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }))
  await expect(WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-folder'](ctx)).rejects.toThrow(
    'permission denied'
  )
  expect(write).not.toHaveBeenCalled()
})

it('rejects pattern injection and missing host expectations before RPC and never retries an old peer', async () => {
  const { input, ctx, params, call } = await setup()
  for (const payload of [
    { ...params, folderName: 'dist\ninjected' },
    { worktree: params.worktree, folderName: 'dist' }
  ]) {
    await writeFile(input, JSON.stringify(payload))
    await expect(WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-folder'](ctx)).rejects.toMatchObject({
      code: 'invalid_argument'
    })
  }
  expect(call).not.toHaveBeenCalled()
  await writeFile(input, JSON.stringify(params))
  ctx.flags.set('confirm', 'id:fixture:dist')
  call.mockRejectedValueOnce(new Error('method_not_found'))
  await expect(WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-folder'](ctx)).rejects.toThrow(
    'method_not_found'
  )
  expect(call).toHaveBeenCalledTimes(1)
})

it('appends only on the SSH provider and rejects stale writes or a lost provider without changing a local shadow', async () => {
  remote.connected = true
  const { cwd, input, ctx, params } = await setup('ssh:fixture')
  const shadow = join(cwd, '.gitignore')
  await writeFile(shadow, 'local shadow')
  ctx.flags.set('confirm', 'id:fixture:dist')
  const selected = {
    ...params,
    expectedExecutionHostId: 'ssh:fixture',
    expectedSshTargetId: 'fixture',
    expectedSshConnectionGeneration: 0
  }
  await writeFile(input, JSON.stringify(selected))
  await WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-folder'](ctx)
  expect(remote.files.get(shadow)).toBe('dist/\n')
  expect(await readFile(shadow, 'utf8')).toBe('local shadow')
  ctx.flags.set('confirm', 'id:fixture:build')
  await writeFile(
    input,
    JSON.stringify({ ...selected, folderName: 'build', expectedExecutionHostId: 'local' })
  )
  await expect(WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-folder'](ctx)).rejects.toThrow(
    'host changed'
  )
  setSshConnectionGeneration('fixture', 1)
  await writeFile(input, JSON.stringify({ ...selected, folderName: 'build' }))
  await expect(WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-folder'](ctx)).rejects.toThrow(
    'SSH connection changed'
  )
  remote.connected = false
  await writeFile(
    input,
    JSON.stringify({ ...selected, folderName: 'build', expectedSshConnectionGeneration: 1 })
  )
  await expect(WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-folder'](ctx)).rejects.toThrow(
    'Remote connection dropped'
  )
  expect(remote.files.get(shadow)).toBe('dist/\n')
  expect(await readFile(shadow, 'utf8')).toBe('local shadow')
})

it('writes a plain folder ignore file without creating Git metadata and reports Git-only candidate failure', async () => {
  const { cwd, ctx } = await setup()
  await rm(join(cwd, '.git'), { recursive: true, force: true })
  await mkdir(join(cwd, 'dist'))
  ctx.flags.set('confirm', 'id:fixture:dist')
  await WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-folder'](ctx)
  expect(await readFile(join(cwd, '.gitignore'), 'utf8')).toBe('dist/\n')
  await expect(readFile(join(cwd, '.git', 'HEAD'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(WORKSPACE_GIT_IGNORE_HANDLERS['git ignore-candidates'](ctx)).rejects.toThrow()
})
