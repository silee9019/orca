import '../../src/main/daemon/mock-descendant-sweep'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DaemonPtyAdapter } from '../../src/main/daemon/daemon-pty-adapter'
import {
  createMockSubprocess,
  startDaemonAdapterHarness,
  type DaemonAdapterHarness
} from '../../src/main/daemon/daemon-pty-adapter-test-harness'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { DAEMON_MANAGEMENT_METHODS } from '../../src/main/runtime/rpc/methods/daemon-management'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'

const state = vi.hoisted(() => {
  const provider: { current?: DaemonPtyAdapter } = {}
  return { provider, call: vi.fn() }
})
vi.mock('../../src/main/daemon/daemon-init', () => ({
  getDaemonProvider: () => state.provider.current
}))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  class RuntimeClient {
    readonly isRemote = false
    call = state.call
  }
  return { RuntimeClient, ...errors }
})

let harness: DaemonAdapterHarness
let subprocess: ReturnType<typeof createMockSubprocess>
beforeEach(async () => {
  subprocess = createMockSubprocess()
  harness = await startDaemonAdapterHarness(() => subprocess)
  state.provider.current = harness.adapter
  const rpc = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: DAEMON_MANAGEMENT_METHODS
  })
  state.call.mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({
      id: 'isolated-fixture',
      authToken: 'fixture',
      method,
      params
    })
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
  vi.restoreAllMocks()
  delete state.provider.current
  process.exitCode = undefined
  harness.adapter.dispose()
  await harness.server.shutdown()
  rmSync(harness.dir, { recursive: true, force: true })
})

async function target() {
  const { id } = await harness.adapter.spawn({ cols: 80, rows: 24 })
  const row = (await harness.adapter.listSessions()).find((entry) => entry.sessionId === id)
  if (!row?.incarnationId) {
    throw new Error('Missing fixture session')
  }
  return {
    sessionId: id,
    incarnationId: row.incarnationId,
    protocolVersion: harness.adapter.protocolVersion,
    confirm: true
  }
}
async function stop(action: string, request: unknown) {
  const file = join(harness.dir, 'request.json')
  await writeFile(file, JSON.stringify(request))
  await main(['terminal', 'daemon', action, '--request-file', file, '--json'], harness.dir)
}

it('lists and ends one exact process through public CLI, real RPC and isolated daemon socket', async () => {
  const observed = await target()
  await main(['terminal', 'daemon', 'list', '--json'], harness.dir)
  expect(process.exitCode).toBeUndefined()
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).toContain(observed.incarnationId)
  await stop('stop', observed)
  expect(process.exitCode).toBeUndefined()
  expect(subprocess.forceKill).toHaveBeenCalledOnce()
  expect(await harness.adapter.listSessions()).toEqual([])
})
it('rejects a stale target through the public CLI without affecting the current process', async () => {
  const observed = await target()
  await stop('stop', { ...observed, incarnationId: 'stale' })
  expect(process.exitCode).toBe(1)
  expect(subprocess.forceKill).not.toHaveBeenCalled()
  expect(await harness.adapter.listSessions()).toHaveLength(1)
})
it('keeps each batch refusal and reports failure instead of losing partial evidence', async () => {
  const observed = await target()
  await stop('stop-many', { targets: [observed, { ...observed, incarnationId: 'stale' }] })
  expect(process.exitCode).toBe(1)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).toContain('unverifiable')
  expect(subprocess.forceKill).toHaveBeenCalledOnce()
})
