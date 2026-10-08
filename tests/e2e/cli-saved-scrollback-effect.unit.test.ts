import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installFakeAppEnvironment } from '../../config/scripts/vitest-host-ports-setup'
import { initDataPath } from '../../src/main/persistence/loading-store/user-data-path'
import { Store } from '../../src/main/persistence/loading-store/store'
import { writeTerminalScrollbackSnapshotSync } from '../../src/main/terminal-scrollback-snapshots'
import { TERMINAL_SCROLLBACK_REPLAY_BYTE_LIMIT } from '../../src/shared/terminal-scrollback-limits'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { TERMINAL_HOST_DETAILS_METHODS } from '../../src/main/runtime/rpc/methods/terminal-host-details'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  class RuntimeClient {
    readonly isRemote = false
    call = state.call
  }
  return { RuntimeClient, ...errors }
})
let root: string
let snapshots: string
let ref: string
let rpc: RpcDispatcher
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-saved-scrollback-'))
  installFakeAppEnvironment({ getPath: () => join(root, 'legacy') })
  initDataPath()
  snapshots = join(root, 'profile', 'terminal-scrollback')
  const written = writeTerminalScrollbackSnapshotSync({
    tabId: 'fixture-tab',
    leafId: 'fixture-leaf',
    buffer: '저장된 터미널 fixture',
    storage: { snapshotRoot: snapshots }
  })
  if (!written) {
    throw new Error('Missing saved scrollback fixture')
  }
  ref = written
  const store = new Store({
    dataFile: join(root, 'profile', 'orca-data.json'),
    serializedState: '{}'
  })
  rpc = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: TERMINAL_HOST_DETAILS_METHODS
  })
  state.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({ id: 'scrollback', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = undefined
})
afterEach(async () => {
  process.exitCode = undefined
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})
async function command(request: unknown) {
  const file = join(root, 'request.json')
  await writeFile(file, JSON.stringify(request))
  vi.mocked(console.log).mockClear()
  await main(['terminal', 'saved-scrollback', '--request-file', file, '--json'], root)
  return JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))
}
it('reads the host profile snapshot without changing it and preserves the existing byte cap', async () => {
  const file = join(snapshots, `${ref}.bin`)
  const before = await readFile(file)
  expect(await command({ ref })).toMatchObject({
    ok: true,
    result: { buffer: '저장된 터미널 fixture' }
  })
  expect(process.exitCode).toBeUndefined()
  expect(await readFile(file)).toEqual(before)
  await writeFile(file, `${'앞'.repeat(TERMINAL_SCROLLBACK_REPLAY_BYTE_LIMIT)}끝`)
  const response = await command({ ref })
  expect(response.ok).toBe(true)
  expect(Buffer.byteLength(response.result.buffer)).toBeLessThanOrEqual(
    TERMINAL_SCROLLBACK_REPLAY_BYTE_LIMIT
  )
  expect(response.result.buffer.endsWith('끝')).toBe(true)
  expect(response.result.buffer).not.toContain('�')
})
it('returns null for a missing snapshot and rejects file paths before RPC', async () => {
  expect(await command({ ref: `v1-${'0'.repeat(32)}` })).toMatchObject({
    ok: true,
    result: { buffer: null }
  })
  state.call.mockClear()
  expect(await command({ ref: '../orca-data.json' })).toMatchObject({ ok: false })
  expect(process.exitCode).toBe(1)
  expect(state.call).not.toHaveBeenCalled()
})
it('refuses an unavailable store and an old host without a client disk fallback', async () => {
  rpc = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: TERMINAL_HOST_DETAILS_METHODS
  })
  expect(await command({ ref })).toMatchObject({ ok: false })
  expect(process.exitCode).toBe(1)
  state.call.mockReset().mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  expect(await command({ ref })).toMatchObject({ ok: false })
  expect(state.call).toHaveBeenCalledExactlyOnceWith('session.readTerminalScrollback', { ref })
})
