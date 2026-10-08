import '../../src/main/runtime/orca-runtime-test-mocks.spec'
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
it('provides private preview input without putting terminal text in command arguments or receipts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-cli-preview-input-'))
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
    mocks.call.mockResolvedValue({ ok: true, result: { accepted: true } })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await main(
      ['terminal', 'preview-input', '--request-file', file, '--text-file', input, '--json'],
      root
    )
    expect(mocks.call).toHaveBeenCalledWith('terminal.previewInput', { ...request, data })
    expect(process.exitCode).toBeUndefined()
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(data)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

const { createRuntime, syncSinglePty, TEST_WORKTREE_ID } =
  await import('../../src/main/runtime/orca-runtime-test-fixtures.spec')
const { RpcDispatcher } = await import('../../src/main/runtime/rpc/dispatcher')
const { TERMINAL_PREVIEW_INPUT_METHODS } =
  await import('../../src/main/runtime/rpc/methods/terminal-preview-input')
const { RuntimeRpcFailureError } = await import('../../src/cli/runtime/types')
const { TERMINAL_INPUT_CHUNK_MAX_BYTES } = await import('../../src/shared/terminal-input')
it.each([
  'accepted',
  'mobile',
  'mobile-handoff',
  'replacement-before-write',
  'replacement',
  'cancelled',
  'provider-refused',
  'wrong-host',
  'stale',
  'old-host',
  'invalid-utf8',
  'empty'
])('preserves canonical preview behavior through CLI/RPC: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-cli-preview-rpc-'))
  try {
    const runtime = createRuntime()
    const written: string[] = []
    const ptyId = 'fixture-preview-pty'
    const incarnationId = 'fixture-preview-incarnation'
    const abort = new AbortController()
    let driverChecks = 0
    let mobile = mode === 'mobile'
    vi.spyOn(runtime, 'getDriver').mockImplementation(() => {
      driverChecks++
      if (mode === 'replacement-before-write' && driverChecks === 2) {
        queueMicrotask(() => bind('replacement-incarnation'))
      }
      return mobile ? { kind: 'mobile', clientId: 'fixture-phone' } : { kind: 'idle' }
    })
    const bind = (incarnation: string) =>
      runtime.registerPty(ptyId, TEST_WORKTREE_ID, null, {
        tabId: 'tab-1',
        leafId: 'pane:1',
        incarnationId: incarnation
      })
    runtime.setPtyController({
      write: (_id, data, inputKind) => {
        expect(_id).toBe(ptyId)
        expect(inputKind).toBe('driving')
        if (mode === 'provider-refused') {
          return false
        }
        written.push(data)
        if (mode === 'mobile-handoff') {
          mobile = true
        }
        if (mode === 'replacement') {
          bind('replacement-incarnation')
        }
        if (mode === 'cancelled') {
          abort.abort()
        }
        return true
      },
      kill: () => {
        throw new Error('Unexpected kill')
      },
      getForegroundProcess: async () => null
    })
    syncSinglePty(runtime, ptyId)
    bind(incarnationId)
    const terminal = (await runtime.listTerminals()).terminals[0].handle
    const dispatcher = new RpcDispatcher({
      runtime,
      methods: mode === 'old-host' ? [] : TERMINAL_PREVIEW_INPUT_METHODS
    })
    mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
      const response = await dispatcher.dispatch(
        { id: 'preview-fixture', method, params, authToken: 'fixture' },
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
      expectedIncarnationId: mode === 'stale' ? 'stale-incarnation' : incarnationId,
      expectedExecutionHostId: mode === 'wrong-host' ? 'ssh:wrong-host' : 'local',
      confirm: true
    }
    const data = '한글 private preview canary'.repeat(1600)
    const file = join(root, 'target.json')
    const input = join(root, 'input.txt')
    await writeFile(file, JSON.stringify(request))
    await writeFile(
      input,
      mode === 'invalid-utf8' ? Buffer.from([0xff]) : mode === 'empty' ? '' : data
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    driverChecks = 0
    await main(
      ['terminal', 'preview-input', '--request-file', file, '--text-file', input, '--json'],
      root
    )
    expect(process.exitCode).toBe(mode === 'accepted' ? undefined : 1)
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
      'private preview canary'
    )
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      'private preview canary'
    )
    if (mode === 'accepted') {
      expect(written.join('')).toBe(data)
      expect(written.length).toBeGreaterThan(1)
      expect(
        written.every((text) => Buffer.byteLength(text) <= TERMINAL_INPUT_CHUNK_MAX_BYTES)
      ).toBe(true)
    } else if (['mobile-handoff', 'replacement', 'cancelled'].includes(mode)) {
      expect(written).toHaveLength(1)
      expect(
        JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0])).result
      ).toMatchObject({ accepted: false, partialInputPossible: true })
    } else {
      expect(written).toEqual([])
    }
    if (['invalid-utf8', 'empty'].includes(mode)) {
      expect(mocks.call).not.toHaveBeenCalled()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
it('refuses conflicting stdin sources before reading either stream', async () => {
  mocks.call.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await main(['terminal', 'preview-input', '--request-file', '-', '--text-file', '-', '--json'])
  expect(process.exitCode).toBe(1)
  expect(mocks.call).not.toHaveBeenCalled()
})
