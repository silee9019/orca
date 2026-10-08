import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import type * as ProviderRegistry from '../../src/main/ipc/pty/provider/registry'
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
it('provides private PTY input without putting terminal text in command arguments or receipts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-cli-write-input-accepted-'))
  try {
    const request = {
      terminal: 't1',
      expectedPtyId: 'fixture-pty',
      expectedIncarnationId: 'fixture-incarnation',
      expectedExecutionHostId: 'local',
      confirm: true
    }
    const file = join(root, 'request.json')
    const input = join(root, 'input.txt')
    const data = '한글 private preview canary'
    await writeFile(file, JSON.stringify(request))
    await writeFile(input, data)
    mocks.call.mockResolvedValue({ ok: true, result: { accepted: true, queued: true } })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await main(
      ['terminal', 'write-input-accepted', '--request-file', file, '--text-file', input, '--json'],
      root
    )
    expect(mocks.call).toHaveBeenCalledWith('terminal.writeInputAccepted', { ...request, data })
    expect(process.exitCode).toBeUndefined()
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(data)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

const providerMock = vi.hoisted(() => ({ write: vi.fn(), hasPty: vi.fn(() => true) }))
vi.mock('../../src/main/ipc/pty/provider/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof ProviderRegistry>()),
  tryGetProviderForPty: () => providerMock
}))
const { createRuntime, syncSinglePty, TEST_WORKTREE_ID } =
  await import('../../src/main/runtime/orca-runtime-test-fixtures.spec')
const { RpcDispatcher } = await import('../../src/main/runtime/rpc/dispatcher')
const { TERMINAL_PTY_INPUT_METHODS } =
  await import('../../src/main/runtime/rpc/methods/terminal-pty-input')
const { RuntimeRpcFailureError } = await import('../../src/cli/runtime/types')
const { ptyOwnership, ptyIncarnationById } =
  await import('../../src/main/ipc/pty/provider/ownership-state')
it.each([
  'accepted',
  'ssh-accepted',
  'ssh-queued',
  'mobile',
  'mobile-handoff',
  'replacement',
  'cancelled',
  'provider-refused',
  'wrong-host',
  'stale',
  'old-host',
  'invalid-utf8',
  'empty'
])('preserves canonical PTY input through public CLI/RPC: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-cli-pty-input-'))
  const ptyId = mode.startsWith('ssh-') ? 'ssh:fixture@@fixture-pty-input' : 'fixture-pty-input'
  try {
    const runtime = createRuntime()
    const incarnationId = 'fixture-pty-incarnation'
    const host = mode.startsWith('ssh-') ? 'ssh:fixture' : 'local'
    const written: string[] = []
    const abort = new AbortController()
    let mobile = mode === 'mobile'
    vi.spyOn(runtime, 'getDriver').mockImplementation(() =>
      mobile ? { kind: 'mobile', clientId: 'fixture' } : { kind: 'idle' }
    )
    const bind = (incarnation: string) =>
      runtime.registerPty(ptyId, TEST_WORKTREE_ID, host === 'local' ? null : 'fixture', {
        tabId: 'tab-1',
        leafId: 'pane:1',
        incarnationId: incarnation
      })
    syncSinglePty(runtime, ptyId)
    bind(incarnationId)
    ptyOwnership.set(ptyId, host === 'local' ? null : 'fixture')
    ptyIncarnationById.set(ptyId, incarnationId)
    providerMock.hasPty.mockReturnValue(true)
    providerMock.write.mockReset().mockImplementation((_id: string, data: string) => {
      expect(_id).toBe(ptyId)
      if (mode === 'provider-refused') {
        throw new Error('private-provider-error')
      }
      written.push(data)
      if (mode === 'mobile-handoff') {
        mobile = true
      }
      if (mode === 'replacement') {
        bind('replacement')
        ptyIncarnationById.set(ptyId, 'replacement')
      }
      if (mode === 'cancelled') {
        abort.abort()
      }
    })
    const terminal = (await runtime.listTerminals()).terminals[0].handle
    const dispatcher = new RpcDispatcher({
      runtime,
      methods: mode === 'old-host' ? [] : TERMINAL_PTY_INPUT_METHODS
    })
    mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
      const response = await dispatcher.dispatch(
        { id: 'input', authToken: 'fixture', method, params },
        { signal: abort.signal }
      )
      if (!response.ok) {
        throw new RuntimeRpcFailureError(response)
      }
      return response
    })
    const request = {
      terminal,
      expectedPtyId: ptyId,
      expectedIncarnationId: mode === 'stale' ? 'stale' : incarnationId,
      expectedExecutionHostId: mode === 'wrong-host' ? 'ssh:wrong' : host,
      confirm: true
    }
    const data = '한글 private PTY canary'.repeat(1600)
    const file = join(root, 'target.json'),
      input = join(root, 'input.txt')
    await writeFile(file, JSON.stringify(request))
    await writeFile(
      input,
      mode === 'invalid-utf8' ? Buffer.from([0xff]) : mode === 'empty' ? '' : data
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await main(
      [
        'terminal',
        mode === 'ssh-queued' ? 'write-input' : 'write-input-accepted',
        '--request-file',
        file,
        '--text-file',
        input,
        '--json'
      ],
      root
    )
    const successful = mode === 'accepted' || mode === 'ssh-queued'
    expect(
      process.exitCode,
      JSON.stringify({
        receipt: vi.mocked(console.log).mock.calls,
        written: written.map((data) => data.length)
      })
    ).toBe(successful ? undefined : 1)
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private PTY canary')
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
      'private-provider-error'
    )
    if (successful) {
      expect(written.join('')).toBe(data)
    } else if (['mobile-handoff', 'replacement', 'cancelled'].includes(mode)) {
      expect(written.length).toBe(1)
    } else {
      expect(written).toEqual([])
    }
  } finally {
    ptyOwnership.delete(ptyId)
    ptyIncarnationById.delete(ptyId)
    await rm(root, { recursive: true, force: true })
  }
})

const inputFactory = await import('../../src/main/ipc/pty/ipc/write-input')
const { setPtyHostBindings } = await import('../../src/main/ipc/pty-host-bindings')
const { installPtyWriteIpcHandlers } = await import('../../src/main/ipc/pty/ipc/write')
const { writeGuardedRendererPtyInput } =
  await import('../../src/main/ipc/pty/runtime/renderer-pty-input')
it.each([true, false])(
  'waits for the existing host viewport claim and preserves its result: %s',
  async (claimed) => {
    const runtime = createRuntime()
    const id = 'fixture-claim-input',
      incarnationId = 'fixture-claim-incarnation'
    const on = vi.fn()
    setPtyHostBindings({
      ipc: { on, handle: vi.fn(), removeHandler: vi.fn(), removeAllListeners: vi.fn() }
    })
    const original = inputFactory.createPtyWriteInput
    vi.spyOn(inputFactory, 'createPtyWriteInput').mockImplementation((deps) => ({
      ...original(deps),
      isPtyWriteEventFromMainWindow: () => true
    }))
    let finish: (value: boolean) => void = () => {
      throw new Error('Fixture not initialized')
    }
    const claim = new Promise<boolean>((resolve) => {
      finish = resolve
    })
    vi.spyOn(runtime, 'claimRemoteDesktopHost').mockReturnValue(claim)
    vi.spyOn(runtime, 'getDriver').mockReturnValue({ kind: 'idle' })
    ptyOwnership.set(id, null)
    ptyIncarnationById.set(id, incarnationId)
    providerMock.write.mockReset()
    try {
      installPtyWriteIpcHandlers({ runtime })
      const listener = on.mock.calls.find((call) => call[0] === 'pty:claimViewport')?.[1]
      expect(listener).toBeTypeOf('function')
      listener(null, { id, cols: 80, rows: 24 })
      const pending = writeGuardedRendererPtyInput(
        runtime,
        id,
        'private viewport input',
        {
          expectedExecutionHostId: 'local',
          expectedIncarnationId: incarnationId,
          acceptedOnly: true
        },
        () => {}
      )
      await Promise.resolve()
      expect(providerMock.write).not.toHaveBeenCalled()
      finish(claimed)
      expect(await pending).toBe(claimed)
      expect(providerMock.write).toHaveBeenCalledTimes(claimed ? 1 : 0)
    } finally {
      finish(false)
      setPtyHostBindings({})
      ptyOwnership.delete(id)
      ptyIncarnationById.delete(id)
    }
  }
)

it.each(['terminal.writeInput', 'terminal.writeInputAccepted'])(
  'cancels real local %s while waiting on the canonical viewport queue after disconnect',
  async (method) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-pty-input-admission-'))
    const runtime = createRuntime(),
      id = 'fixture-admission-input',
      incarnationId = 'fixture-admission-incarnation'
    const server = new OrcaRuntimeRpcServer({ runtime, userDataPath: root, enableWebSocket: false })
    vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
    vi.spyOn(runtime, 'getDriver').mockReturnValue({ kind: 'idle' })
    const identity = vi.spyOn(runtime, 'getTerminalProcessIncarnation')
    syncSinglePty(runtime, id)
    runtime.registerPty(id, TEST_WORKTREE_ID, null, {
      tabId: 'tab-1',
      leafId: 'pane:1',
      incarnationId
    })
    ptyOwnership.set(id, null)
    ptyIncarnationById.set(id, incarnationId)
    const terminal = (await runtime.listTerminals()).terminals[0].handle
    const on = vi.fn()
    setPtyHostBindings({
      ipc: { on, handle: vi.fn(), removeHandler: vi.fn(), removeAllListeners: vi.fn() }
    })
    const original = inputFactory.createPtyWriteInput
    vi.spyOn(inputFactory, 'createPtyWriteInput').mockImplementation((deps) => ({
      ...original(deps),
      isPtyWriteEventFromMainWindow: () => true
    }))
    let finish: (value: boolean) => void = () => {}
    vi.spyOn(runtime, 'claimRemoteDesktopHost').mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    installPtyWriteIpcHandlers({ runtime })
    on.mock.calls.find((call) => call[0] === 'pty:claimViewport')?.[1](null, {
      id,
      cols: 80,
      rows: 24
    })
    providerMock.write.mockReset()
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
      identity.mockClear()
      client.write(
        `${JSON.stringify({
          id: 'cancel-input',
          authToken: metadata.authToken,
          method,
          params: {
            terminal,
            expectedPtyId: id,
            expectedIncarnationId: incarnationId,
            expectedExecutionHostId: 'local',
            confirm: true,
            data: 'private pending input'
          }
        })}\n`
      )
      await vi.waitFor(() => expect(identity).toHaveBeenCalled())
      client.destroy()
      await new Promise((resolve) => setTimeout(resolve, 50))
      finish(true)
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(providerMock.write).not.toHaveBeenCalled()
    } finally {
      finish(false)
      client?.destroy()
      await server.stop()
      setPtyHostBindings({})
      ptyOwnership.delete(id)
      ptyIncarnationById.delete(id)
      await rm(root, { recursive: true, force: true })
    }
  }
)

it('requires a local acceptance receipt for write-input-accepted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-pty-input-receipt-'))
  try {
    const file = join(root, 'target.json'),
      input = join(root, 'input.txt')
    await writeFile(
      file,
      JSON.stringify({
        terminal: 'fixture',
        expectedPtyId: 'fixture',
        expectedIncarnationId: 'fixture',
        expectedExecutionHostId: 'local',
        confirm: true
      })
    )
    await writeFile(input, 'private receipt input')
    mocks.call
      .mockReset()
      .mockResolvedValue({ ok: true, result: { queued: true, accepted: false } })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await main(
      ['terminal', 'write-input-accepted', '--request-file', file, '--text-file', input, '--json'],
      root
    )
    expect(process.exitCode).toBe(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
