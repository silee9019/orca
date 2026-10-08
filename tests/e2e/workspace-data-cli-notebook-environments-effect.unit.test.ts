import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../../src/shared/child-process/run-process', () => ({ runProcess: vi.fn() }))
vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
import { runProcess } from '../../src/shared/child-process/run-process'
import { venvInterpreterSegments } from '../../src/shared/notebook-venv-location'
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_NOTEBOOK_ENVIRONMENT_HANDLERS } from '../../src/cli/handlers/workspace-notebook-environments'
import {
  WORKSPACE_NOTEBOOK_ENVIRONMENT_METHODS,
  setDesktopNotebookEnvironmentsForRpc
} from '../../src/main/runtime/rpc/methods/workspace-notebook-environments'
import { registerNotebookEnvironmentHandlers } from '../../src/main/notebook/environment-handlers'
const processRun = vi.mocked(runProcess)
let notebook: string
let failedInstall = false
let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
let runtime: OrcaRuntimeService
function lastResult() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-notebook-env-cli-'))
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
  notebook = join(directory, 'fixture.ipynb')
  await writeFile(notebook, '{}')
  processRun.mockReset()
  processRun.mockImplementation(async (spec) => {
    const args = spec.args ?? []
    if (args[0] === '-m' && args[1] === 'venv') {
      const python = join(args[2], ...venvInterpreterSegments(process.platform === 'win32'))
      await mkdir(dirname(python), { recursive: true })
      await writeFile(python, 'fixture interpreter')
    } else if (args[0] === '-m' && args[1] === 'pip') {
      if (failedInstall) {
        return {
          code: 1,
          signal: null,
          stdout: '',
          stderr: 'private-install-canary',
          timedOut: false
        }
      }
      await writeFile(join(directory, 'installed-fixture'), spec.program)
    }
    return {
      code: 0,
      signal: null,
      stdout: `${spec.program}\n3.14.0\n`,
      stderr: '',
      timedOut: false
    }
  })
  failedInstall = false
  runtime = new OrcaRuntimeService(store)
  registerNotebookEnvironmentHandlers(store)
  const dispatcher = new RpcDispatcher({
    runtime,
    methods: WORKSPACE_NOTEBOOK_ENVIRONMENT_METHODS
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
  setDesktopNotebookEnvironmentsForRpc(null)
  await store.freezeWritesAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

async function invoke(command: string, params: object, confirm: string | null): Promise<void> {
  const file = join(directory, 'input.json')
  await writeFile(file, JSON.stringify(params))
  ctx.flags.set('params-file', file)
  if (confirm === null) {
    ctx.flags.delete('confirm')
  } else {
    ctx.flags.set('confirm', confirm)
  }
  await WORKSPACE_NOTEBOOK_ENVIRONMENT_HANDLERS[command](ctx)
}
it('lists a discovered workspace environment without running it until explicitly requested', async () => {
  const python = join(directory, '.venv', ...venvInterpreterSegments(process.platform === 'win32'))
  await mkdir(dirname(python), { recursive: true })
  await writeFile(python, 'fixture interpreter')
  const params = { filePath: notebook, rootPath: null, expectedExecutionHostId: 'local' }
  await invoke('notebook environments', params, notebook)
  expect(lastResult().workspace).toEqual([expect.objectContaining({ path: python })])
  expect(processRun.mock.calls.some(([spec]) => spec.program === python)).toBe(false)
  processRun.mockClear()
  await invoke('notebook environments', { ...params, runWorkspaceInterpreters: true }, notebook)
  expect(processRun.mock.calls.some(([spec]) => spec.program === python)).toBe(true)
  expect(lastResult().workspace[0].version).toBe('3.14.0')
})
it('describes the selected host interpreter through the original bounded probe', async () => {
  const path = join(directory, 'fixture-python')
  await invoke('notebook describe-python', { path, expectedExecutionHostId: 'local' }, path)
  expect(lastResult()).toMatchObject({ path, version: '3.14.0' })
  expect(processRun).toHaveBeenCalledWith(
    expect.objectContaining({ program: path, timeoutMs: 10000 })
  )
})
it('creates and prepares an isolated venv using the real orchestration with a subprocess fixture', async () => {
  const python = join(directory, 'fixture-python')
  const params = { filePath: notebook, rootPath: null, python, expectedExecutionHostId: 'local' }
  await invoke('notebook create-venv', params, notebook)
  const interpreter = join(
    directory,
    '.venv',
    ...venvInterpreterSegments(process.platform === 'win32')
  )
  expect(lastResult()).toMatchObject({
    ok: true,
    environment: { path: interpreter, version: '3.14.0' }
  })
  expect(await readFile(interpreter, 'utf8')).toBe('fixture interpreter')
  expect(await readFile(join(directory, 'installed-fixture'), 'utf8')).toBe(interpreter)
  await invoke('notebook create-venv', params, notebook)
  expect(processRun.mock.calls.filter(([spec]) => spec.args?.[1] === 'venv')).toHaveLength(1)
  expect(await readFile(notebook, 'utf8')).toBe('{}')
})
it('installs through the original pip and import checks and hides failed subprocess details', async () => {
  const python = join(directory, 'fixture-python')
  await invoke('notebook install-ipykernel', { python, expectedExecutionHostId: 'local' }, python)
  expect(lastResult()).toEqual({ installed: true })
  expect(ctx.client.call).toHaveBeenCalledWith(
    'notebook.installDesktopIpykernel',
    expect.anything(),
    { timeoutMs: 2100000 }
  )
  expect(
    processRun.mock.calls.some(([spec]) =>
      spec.args?.includes('import ipykernel, jupyter_client.manager')
    )
  ).toBe(true)
  vi.mocked(console.log).mockClear()
  failedInstall = true
  await expect(
    invoke('notebook install-ipykernel', { python, expectedExecutionHostId: 'local' }, python)
  ).rejects.toThrow('Notebook kernel package installation failed.')
  expect(console.log).not.toHaveBeenCalled()
})
it('rejects missing confirmation, wrong host and missing notebook files before starting interpreters', async () => {
  const params = { filePath: notebook, rootPath: null, expectedExecutionHostId: 'local' }
  await expect(invoke('notebook environments', params, null)).rejects.toThrow()
  await expect(
    invoke('notebook environments', { ...params, expectedExecutionHostId: 'ssh:fixture' }, notebook)
  ).rejects.toThrow()
  const missing = join(directory, 'absent.ipynb')
  await expect(
    invoke('notebook environments', { ...params, filePath: missing }, missing)
  ).rejects.toThrow()
  expect(processRun).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})
it('fails on absent services and old peers without running client interpreters', async () => {
  const path = join(directory, 'fixture-python')
  setDesktopNotebookEnvironmentsForRpc(null)
  await expect(
    invoke('notebook describe-python', { path, expectedExecutionHostId: 'local' }, path)
  ).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(
    invoke('notebook describe-python', { path, expectedExecutionHostId: 'local' }, path)
  ).rejects.toMatchObject({ code: 'method_not_found' })
  expect(processRun).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})

it('rejects an unauthorized venv root before invoking a subprocess', async () => {
  const rootPath = join(directory, 'ungranted-root')
  await mkdir(rootPath)
  await expect(
    invoke(
      'notebook create-venv',
      {
        filePath: notebook,
        rootPath,
        python: join(directory, 'fixture-python'),
        expectedExecutionHostId: 'local'
      },
      notebook
    )
  ).rejects.toThrow('Notebook environment preparation failed.')
  expect(processRun).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})
