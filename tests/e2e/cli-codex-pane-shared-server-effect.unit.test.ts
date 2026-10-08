import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  createRuntime,
  syncSinglePty
} from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  hasProvider: vi.fn(),
  list: vi.fn(),
  pane: vi.fn(),
  home: vi.fn(),
  run: vi.fn(),
  probe: vi.fn()
}))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  return {
    RuntimeClient: class {
      readonly isRemote = false
      call = mocks.call
    },
    ...errors
  }
})
vi.mock('../../src/main/ipc/pty/provider/registry', () => ({
  hasPtyProviderForInspection: mocks.hasProvider,
  getProviderForPty: () => ({ listProcesses: mocks.list })
}))
vi.mock('../../src/main/codex/codex-shared-server-pane', () => ({
  findPaneCodexOnSharedServer: mocks.pane,
  resolveCodexPaneHome: mocks.home
}))
vi.mock('../../src/main/daemon/daemon-provider-routing', () => ({
  getLegacyDaemonAdapters: () => []
}))
vi.mock('../../src/shared/child-process/run-process', () => ({ runProcess: mocks.run }))
vi.mock('../../src/main/codex/codex-shared-server-probe', () => ({
  probeCodexSharedServer: mocks.probe
}))
let root: string
let home: string
let path: string
let terminal: string
let runtime: ReturnType<typeof createRuntime>
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-codex-server-'))
  home = join(root, 'pane-home')
  const bin = join(home, 'packages', 'app-server-daemon', 'current', 'bin')
  await mkdir(bin, { recursive: true })
  await writeFile(
    join(bin, process.platform === 'win32' ? 'codex.exe' : 'codex'),
    'fixture binary marker'
  )
  await writeFile(join(home, 'config.toml'), 'daemon_auto_start = true\n')
  mocks.hasProvider.mockReturnValue(true)
  mocks.list.mockResolvedValue([{ id: 'pty-1', rootProcessId: 4242 }])
  mocks.pane.mockResolvedValue({ command: 'codex', shell: 'zsh' })
  mocks.home.mockReturnValue(home)
  mocks.probe.mockResolvedValue('live')
  mocks.run.mockReset().mockImplementation(async (spec) => {
    if (spec.program !== join(bin, process.platform === 'win32' ? 'codex.exe' : 'codex')) {
      return { code: 0, timedOut: false, stdout: '', stderr: '' }
    }
    expect(spec.env.CODEX_HOME).toBe(home)
    expect(spec.program).toBe(join(bin, process.platform === 'win32' ? 'codex.exe' : 'codex'))
    if (spec.args[0] === 'features' && spec.args[1] === 'disable') {
      await writeFile(join(home, 'config.toml'), 'daemon_auto_start = false\n')
    }
    if (spec.args[0] === 'app-server' && spec.args.includes('stop')) {
      mocks.probe.mockResolvedValue('absent')
    }
    return {
      code: 0,
      timedOut: false,
      stdout: (await readFile(join(home, 'config.toml'), 'utf8')).includes('false')
        ? 'daemon_auto_start experimental false\n'
        : 'daemon_auto_start experimental true\n',
      stderr: ''
    }
  })
  runtime = createRuntime()
  runtime.setPtyController({
    write: () => true,
    kill: () => {
      throw new Error('Unexpected PTY kill')
    },
    getForegroundProcess: async () => null,
    getSize: () => null,
    codexSharedServer: {
      readStatus: async (id) =>
        (await import('../../src/main/codex/codex-pane-shared-server-commands'))
          .createCodexPaneSharedServerCommands({
            getLocalPtyProviderStartupPromise: () => undefined
          })
          .readStatus(id),
      disableAutoStart: async (id) =>
        (await import('../../src/main/codex/codex-pane-shared-server-commands'))
          .createCodexPaneSharedServerCommands({
            getLocalPtyProviderStartupPromise: () => undefined
          })
          .disableAutoStart(id),
      stop: async (id) =>
        (await import('../../src/main/codex/codex-pane-shared-server-commands'))
          .createCodexPaneSharedServerCommands({
            getLocalPtyProviderStartupPromise: () => undefined
          })
          .stop(id)
    }
  })
  syncSinglePty(runtime)
  terminal = (await runtime.listTerminals()).terminals[0].handle
  path = join(root, 'request.json')
  await writeFile(path, JSON.stringify({ terminal, confirm: true }))
  // The new RPC module is loaded only if the new CLI command dispatches it.
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const { CODEX_PANE_SHARED_SERVER_METHODS } =
      await import('../../src/main/runtime/rpc/methods/codex-pane-shared-server')
    const response = await new RpcDispatcher({
      runtime,
      methods: CODEX_PANE_SHARED_SERVER_METHODS
    }).dispatch({ id: 'codex-server', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  mocks.run.mockClear()
  process.exitCode = undefined
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => {
  await runtime.onPtyExit('pty-1', 0)
  vi.restoreAllMocks()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
async function command(action: string) {
  vi.mocked(console.log).mockClear()
  await main(['agent', 'codex-server', action, '--request-file', path, '--json'], root)
  const output = String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
  expect(process.exitCode, output).toBeUndefined()
  return JSON.parse(output).result
}
it('reads the canonical local pane status without running a lifecycle command', async () => {
  await writeFile(path, JSON.stringify({ terminal }))
  expect(await command('status')).toEqual({ status: { joined: true, openedBeforeWrapper: false } })
  expect(mocks.pane).toHaveBeenCalledWith('pty-1', 4242)
  expect(mocks.run).not.toHaveBeenCalled()
})
it('disables auto-start in the pane home and reads it back', async () => {
  expect(await command('disable-auto-start')).toEqual({ applied: true })
  expect(await readFile(join(home, 'config.toml'), 'utf8')).toContain('false')
  expect(mocks.run).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(home)
})
it('requires a confirmed absent probe after stopping the pane-home server', async () => {
  expect(await command('stop')).toEqual({ stopped: true })
  expect(mocks.probe).toHaveBeenCalledWith(home)
  mocks.probe.mockResolvedValue('unknown')
  mocks.run.mockResolvedValue({ code: 0, timedOut: false, stdout: '', stderr: '' })
  await main(['agent', 'codex-server', 'stop', '--request-file', path, '--json'], root)
  expect(process.exitCode).toBe(1)
})
it('requires confirmation before calling the host', async () => {
  await writeFile(path, JSON.stringify({ terminal }))
  await main(['agent', 'codex-server', 'stop', '--request-file', path, '--json'], root)
  expect(process.exitCode).toBe(1)
  expect(mocks.call).not.toHaveBeenCalled()
  expect(mocks.run).not.toHaveBeenCalled()
})

it.each(['wsl', 'missing-provider', 'missing-home'])(
  'refuses mutations for %s without lifecycle calls',
  async (reason) => {
    if (reason === 'wsl') {
      mocks.list.mockResolvedValue([{ id: 'pty-1', rootProcessId: 4242, wslDistro: 'Ubuntu' }])
    }
    if (reason === 'missing-provider') {
      mocks.hasProvider.mockReturnValue(false)
    }
    if (reason === 'missing-home') {
      mocks.home.mockReturnValue(null)
    }
    await main(
      ['agent', 'codex-server', 'disable-auto-start', '--request-file', path, '--json'],
      root
    )
    expect(process.exitCode).toBe(1)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(await readFile(join(home, 'config.toml'), 'utf8')).toContain('true')
  }
)

it('refuses a stale incarnation before inspecting the provider', async () => {
  mocks.list.mockClear()
  await writeFile(path, JSON.stringify({ terminal, confirm: true, expectedIncarnationId: 'stale' }))
  await main(['agent', 'codex-server', 'stop', '--request-file', path, '--json'], root)
  expect(process.exitCode).toBe(1)
  expect(mocks.list).not.toHaveBeenCalled()
  expect(mocks.run).not.toHaveBeenCalled()
})

it('fails once against an older host without calling a local lifecycle fallback', async () => {
  mocks.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  await main(['agent', 'codex-server', 'stop', '--request-file', path, '--json'], root)
  expect(process.exitCode).toBe(1)
  expect(mocks.call).toHaveBeenCalledTimes(1)
  expect(mocks.run).not.toHaveBeenCalled()
})
