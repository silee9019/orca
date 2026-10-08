import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { createConnection } from 'node:net'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import { readRuntimeMetadata } from '../../src/main/runtime/runtime-metadata'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => ({
  ...(await import('../../src/cli/runtime/types.js')),
  RuntimeClient: class {
    readonly isRemote = false
    call = mocks.call
  }
}))
afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = undefined
})
it('provides private driver event without putting terminal text in command arguments or receipts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-cli-wait-driver-'))
  try {
    const request = {
      terminal: 't1',
      expectedPtyId: 'fixture-pty',
      expectedIncarnationId: 'fixture-incarnation',
      expectedExecutionHostId: 'local'
    }
    const file = join(root, 'request.json')
    const input = join(root, 'input.txt')
    const data = 'fixture-only'
    await writeFile(file, JSON.stringify(request))
    await writeFile(input, data)
    mocks.call.mockResolvedValue({
      ok: true,
      result: { observed: true, event: { kind: 'driver', driver: { kind: 'idle' } } }
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await main(['terminal', 'wait-driver', '--request-file', file, '--json'], root)
    expect(mocks.call).toHaveBeenCalledWith('terminal.waitDriver', {
      terminal: request.terminal,
      expectedPtyId: request.expectedPtyId,
      expectedIncarnationId: request.expectedIncarnationId,
      expectedExecutionHostId: request.expectedExecutionHostId,
      timeoutMs: 10000
    })
    expect(process.exitCode).toBeUndefined()
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(data)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

const { createRuntime, syncSinglePty, TEST_WORKTREE_ID } =
  await import('../../src/main/runtime/orca-runtime-test-fixtures.spec')
const { RpcDispatcher } = await import('../../src/main/runtime/rpc/dispatcher')
const { TERMINAL_PRESENTATION_WAIT_METHODS } =
  await import('../../src/main/runtime/rpc/methods/terminal-presentation-wait')
const { RuntimeRpcFailureError } = await import('../../src/cli/runtime/types')
const { RuntimeTerminalDriverController } =
  await import('../../src/main/runtime/runtime-terminal-driver-controller')
it('notifies canonical driver subscribers when an existing driver is cleared', () => {
  const controller = new RuntimeTerminalDriverController({
    notifyChanged: vi.fn(),
    canClaimMobileFloor: () => false,
    commitMobileFloor: async () => {}
  })
  controller.set('fixture', { kind: 'mobile', clientId: 'fixture-phone' })
  const listener = vi.fn(),
    unsubscribe = controller.subscribe('fixture', listener)
  expect(controller.clear('fixture')).toBe(true)
  expect(listener).toHaveBeenCalledWith({ kind: 'idle' })
  unsubscribe()
  expect(controller.clear('fixture')).toBe(false)
})
it.each(['driver', 'fit'] as const)(
  'observes the canonical %s event through public CLI/RPC and releases listeners',
  async (kind) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-presentation-event-'))
    const runtime = createRuntime(),
      ptyId = 'fixture-presentation',
      incarnationId = 'fixture-presentation-incarnation'
    try {
      runtime.setPtyController({
        write: () => true,
        kill: () => {
          throw new Error('Unexpected kill')
        },
        getForegroundProcess: async () => null,
        resize: () => true,
        getSize: () => ({ cols: 80, rows: 24 })
      })
      syncSinglePty(runtime, ptyId)
      runtime.registerPty(ptyId, TEST_WORKTREE_ID, null, {
        tabId: 'tab-1',
        leafId: 'pane:1',
        incarnationId
      })
      const terminal = (await runtime.listTerminals()).terminals[0].handle
      const driverOriginal = runtime.subscribeToDriverChanges.bind(runtime)
      const fitOriginal = runtime.subscribeToFitOverrideChanges.bind(runtime)
      const disposals: ReturnType<typeof vi.fn>[] = []
      const driverSubscribe = vi
        .spyOn(runtime, 'subscribeToDriverChanges')
        .mockImplementation((id, listener) => {
          const dispose = vi.fn(driverOriginal(id, listener))
          disposals.push(dispose)
          return dispose
        })
      const fitSubscribe = vi
        .spyOn(runtime, 'subscribeToFitOverrideChanges')
        .mockImplementation((id, listener) => {
          const dispose = vi.fn(fitOriginal(id, listener))
          disposals.push(dispose)
          return dispose
        })
      const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_PRESENTATION_WAIT_METHODS })
      mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
        const response = await dispatcher.dispatch({
          id: 'event',
          authToken: 'fixture',
          method,
          params
        })
        if (!response.ok) {
          throw new RuntimeRpcFailureError(response)
        }
        return response
      })
      const file = join(root, 'target.json')
      await writeFile(
        file,
        JSON.stringify({
          terminal,
          expectedPtyId: ptyId,
          expectedIncarnationId: incarnationId,
          expectedExecutionHostId: 'local',
          timeoutMs: 1000
        })
      )
      vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const pending = main(['terminal', `wait-${kind}`, '--request-file', file, '--json'], root)
      await vi.waitFor(() =>
        expect(kind === 'driver' ? driverSubscribe : fitSubscribe).toHaveBeenCalled()
      )
      await runtime.handleMobileSubscribe(ptyId, 'fixture-phone', { cols: 40, rows: 12 })
      await pending
      expect(process.exitCode).toBeUndefined()
      const output = JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))
      expect(output).toMatchObject({
        ok: true,
        result: { observed: true, timedOut: false, event: { kind } }
      })
      if (kind === 'driver') {
        expect(output.result.event.driver).toEqual({ kind: 'mobile', clientId: 'fixture-phone' })
      } else {
        expect(output.result.event).toMatchObject({ mode: 'mobile-fit', cols: 40, rows: 12 })
      }
      for (const dispose of disposals) {
        expect(dispose).toHaveBeenCalledOnce()
      }
    } finally {
      runtime.onPtyExit(ptyId)
      await rm(root, { recursive: true, force: true })
    }
  }
)

it.each(['timeout', 'cancelled', 'replacement', 'gone', 'wrong-host', 'old-host'])(
  'releases the bounded fit waiter on %s without claiming an event',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-presentation-boundary-'))
    const runtime = createRuntime(),
      id = 'fixture-event-boundary',
      incarnationId = 'fixture-event-incarnation'
    try {
      syncSinglePty(runtime, id)
      runtime.registerPty(id, TEST_WORKTREE_ID, null, {
        tabId: 'tab-1',
        leafId: 'pane:1',
        incarnationId
      })
      const terminal = (await runtime.listTerminals()).terminals[0].handle
      runtime.setPtyController({
        write: () => true,
        kill: () => {},
        getForegroundProcess: async () => null,
        resize: () => true,
        getSize: () => ({ cols: 80, rows: 24 })
      })
      const original = runtime.subscribeToFitOverrideChanges.bind(runtime)
      const disposals: ReturnType<typeof vi.fn>[] = []
      const subscribed = vi
        .spyOn(runtime, 'subscribeToFitOverrideChanges')
        .mockImplementation((pty, listener) => {
          const dispose = vi.fn(original(pty, listener))
          disposals.push(dispose)
          return dispose
        })
      const abort = new AbortController()
      const dispatcher = new RpcDispatcher({
        runtime,
        methods: mode === 'old-host' ? [] : TERMINAL_PRESENTATION_WAIT_METHODS
      })
      mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
        const response = await dispatcher.dispatch(
          { id: 'boundary', authToken: 'fixture', method, params },
          { signal: abort.signal }
        )
        if (!response.ok) {
          throw new RuntimeRpcFailureError(response)
        }
        return response
      })
      const file = join(root, 'request.json')
      await writeFile(
        file,
        JSON.stringify({
          terminal,
          expectedPtyId: id,
          expectedIncarnationId: incarnationId,
          expectedExecutionHostId: mode === 'wrong-host' ? 'ssh:wrong' : 'local',
          timeoutMs: mode === 'timeout' ? 10 : 1000
        })
      )
      vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const pending = main(['terminal', 'wait-fit', '--request-file', file, '--json'], root)
      if (!['wrong-host', 'old-host'].includes(mode)) {
        await vi.waitFor(() => expect(subscribed).toHaveBeenCalled())
        if (mode === 'cancelled') {
          abort.abort()
        }
        if (mode === 'gone') {
          runtime.onPtyExit(id)
        }
        if (mode === 'replacement') {
          runtime.registerPty(id, TEST_WORKTREE_ID, null, {
            tabId: 'tab-1',
            leafId: 'pane:1',
            incarnationId: 'replacement'
          })
          abort.abort()
        }
      }
      await pending
      expect(process.exitCode).toBe(1)
      for (const dispose of disposals) {
        expect(dispose).toHaveBeenCalledOnce()
      }
      if (mode === 'timeout') {
        expect(JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))).toMatchObject({
          result: { observed: false, timedOut: true, event: null }
        })
      }
    } finally {
      runtime.onPtyExit(id)
      await rm(root, { recursive: true, force: true })
    }
  }
)

it('removes canonical event subscriptions when an authenticated runtime socket disconnects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-presentation-admission-'))
  const runtime = createRuntime(),
    id = 'fixture-event-admission',
    incarnationId = 'fixture-event-incarnation'
  const server = new OrcaRuntimeRpcServer({ runtime, userDataPath: root, enableWebSocket: false })
  vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
  syncSinglePty(runtime, id)
  runtime.registerPty(id, TEST_WORKTREE_ID, null, {
    tabId: 'tab-1',
    leafId: 'pane:1',
    incarnationId
  })
  const terminal = (await runtime.listTerminals()).terminals[0].handle
  const original = runtime.subscribeToFitOverrideChanges.bind(runtime)
  const disposals: ReturnType<typeof vi.fn>[] = []
  vi.spyOn(runtime, 'subscribeToFitOverrideChanges').mockImplementation((pty, listener) => {
    const dispose = vi.fn(original(pty, listener))
    disposals.push(dispose)
    return dispose
  })
  let client: ReturnType<typeof createConnection> | undefined
  try {
    await server.start()
    const metadata = readRuntimeMetadata(root),
      endpoint = metadata?.transports?.find(
        (item) => item.kind === 'unix' || item.kind === 'named-pipe'
      )?.endpoint
    if (!metadata?.authToken || !endpoint) {
      throw new Error('Fixture metadata missing')
    }
    client = createConnection(endpoint)
    await new Promise<void>((resolve, reject) => {
      client?.once('connect', resolve)
      client?.once('error', reject)
    })
    client.write(
      `${JSON.stringify({ id: 'event-disconnect', authToken: metadata.authToken, method: 'terminal.waitFit', params: { terminal, expectedPtyId: id, expectedIncarnationId: incarnationId, expectedExecutionHostId: 'local', timeoutMs: 30000 } })}\n`
    )
    await vi.waitFor(() => expect(disposals).toHaveLength(1))
    client.destroy()
    await vi.waitFor(() => expect(disposals[0]).toHaveBeenCalledOnce(), { timeout: 1000 })
  } finally {
    client?.destroy()
    runtime.onPtyExit(id)
    await server.stop()
    await rm(root, { recursive: true, force: true })
  }
})
