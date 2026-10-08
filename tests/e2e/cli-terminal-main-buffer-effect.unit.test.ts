import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  createRuntime,
  syncSinglePty
} from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import { PtyPendingDataDrainQueue } from '../../src/main/ipc/pty-pending-data-drain-queue'
import { providerSnapshotRequiredPtys } from '../../src/main/ipc/pty/delivery/visibility-state'
import { TERMINAL_HOST_DETAILS_METHODS } from '../../src/main/runtime/rpc/methods/terminal-host-details'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  return {
    RuntimeClient: class {
      readonly isRemote = false
      call = state.call
    },
    ...errors
  }
})
let root: string
let runtime: ReturnType<typeof createRuntime>
let path: string
let terminal: string
let queue: PtyPendingDataDrainQueue
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-main-buffer-'))
  queue = new PtyPendingDataDrainQueue(() => 'active')
  runtime = createRuntime()
  runtime.setPtyController({
    write: () => {
      throw new Error('Unexpected write')
    },
    kill: () => {
      throw new Error('Unexpected kill')
    },
    getForegroundProcess: async () => null,
    getSize: () => ({ cols: 80, rows: 24 }),
    getMainBufferSnapshot: async (id, opts) => {
      const { readMainTerminalBufferSnapshot } =
        await import('../../src/main/runtime/terminal-main-buffer-snapshot')
      return readMainTerminalBufferSnapshot(runtime, queue, { id, opts })
    }
  })
  syncSinglePty(runtime)
  terminal = (await runtime.listTerminals()).terminals[0].handle
  path = join(root, 'request.json')
  await writeFile(path, JSON.stringify({ terminal }))
  const rpc = new RpcDispatcher({ runtime, methods: TERMINAL_HOST_DETAILS_METHODS })
  state.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({ id: 'snapshot', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  process.exitCode = undefined
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => {
  providerSnapshotRequiredPtys.delete('pty-1')
  queue.clear()
  await runtime.onPtyExit('pty-1', 0)
  vi.restoreAllMocks()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
async function command() {
  vi.mocked(console.log).mockClear()
  await main(['terminal', 'main-buffer', '--request-file', path, '--json'], root)
  const output = String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
  expect(process.exitCode, output).toBeUndefined()
  return JSON.parse(output).result
}
it('reads real headless text and preserves sequenced and unsequenced pending bounds', async () => {
  runtime.onPtyData('pty-1', 'private 한글 snapshot\r\n', 1)
  const first = (await command()).snapshot
  expect(first.data).toContain('private 한글 snapshot')
  expect(first).toMatchObject({
    cols: 80,
    rows: 24,
    source: 'headless',
    seq: runtime.getPtyOutputSequence('pty-1'),
    pendingDeliveryStartSeq: runtime.getPtyOutputSequence('pty-1')
  })
  queue.set('pty-1', { data: 'pending', startSeq: 0 })
  expect((await command()).snapshot.pendingDeliveryStartSeq).toBe(0)
  queue.set('pty-1', { data: 'unsequenced' })
  expect((await command()).snapshot).not.toHaveProperty('pendingDeliveryStartSeq')
})
it('refuses a retained tail as full state after a provider gap', async () => {
  runtime.onPtyData('pty-1', 'incomplete tail', 1)
  providerSnapshotRequiredPtys.add('pty-1')
  expect(await command()).toEqual({ snapshot: null })
})
it('rejects invalid and stale requests without RPC fallback', async () => {
  await writeFile(path, JSON.stringify({ terminal, scrollbackRows: 'invalid' }))
  await main(['terminal', 'main-buffer', '--request-file', path, '--json'], root)
  expect(process.exitCode).toBe(1)
  expect(state.call).not.toHaveBeenCalled()
  process.exitCode = undefined
  await writeFile(path, JSON.stringify({ terminal, expectedIncarnationId: 'stale' }))
  await main(['terminal', 'main-buffer', '--request-file', path, '--json'], root)
  expect(process.exitCode).toBe(1)
  expect(state.call).toHaveBeenCalledTimes(1)
})
it('fails once against an old host', async () => {
  state.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      ok: false,
      error: { message: 'Unknown method', code: 'method_not_found' }
    })
  )
  await main(['terminal', 'main-buffer', '--request-file', path, '--json'], root)
  expect(process.exitCode).toBe(1)
  expect(state.call).toHaveBeenCalledTimes(1)
})

it('returns null when the host controller has no snapshot callback', async () => {
  runtime.setPtyController({
    write: () => true,
    kill: () => {
      throw new Error('Unexpected kill')
    },
    getForegroundProcess: async () => null,
    getSize: () => null
  })
  expect(await command()).toEqual({ snapshot: null })
})

it('does not expose a snapshot when its terminal exits while the read is pending', async () => {
  let finish: (value: { data: string; cols: number; rows: number }) => void = () => {}
  const read = vi.spyOn(runtime, 'getMainTerminalBufferSnapshot').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pending = main(['terminal', 'main-buffer', '--request-file', path, '--json'], root)
  await vi.waitFor(() => expect(read).toHaveBeenCalledWith('pty-1', { scrollbackRows: undefined }))
  await runtime.onPtyExit('pty-1', 0)
  finish({ data: 'retired snapshot private canary', cols: 80, rows: 24 })
  await pending
  expect(process.exitCode).toBe(1)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
    'retired snapshot private canary'
  )
})
