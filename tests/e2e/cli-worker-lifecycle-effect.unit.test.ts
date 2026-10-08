import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { ORCHESTRATION_METHODS } from '../../src/main/runtime/rpc/methods/orchestration'
import { createOrchestrationWorkerReleaseHarness } from '../../src/main/runtime/rpc/methods/orchestration/worker/worker-release.test-support'
import {
  orchestrationRequest,
  resultOf
} from '../../src/main/runtime/rpc/orchestration-session-caller-test-fixture'

const transport = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => ({
  ...(await import('../../src/cli/runtime/types.js')),
  RuntimeClient: class {
    readonly isRemote = false
    call = transport.call
  }
}))
const h = createOrchestrationWorkerReleaseHarness()
beforeEach(() => {
  h.setup()
  vi.stubEnv('ORCA_AGENT_SESSION_ID', '')
  vi.stubEnv('ORCA_TERMINAL_HANDLE', '')
  vi.stubEnv('ORCA_PANE_KEY', '')
  const dispatcher = new RpcDispatcher({ runtime: h.runtime, methods: ORCHESTRATION_METHODS })
  transport.call
    .mockReset()
    .mockImplementation(
      async (
        method: string,
        params: Record<string, unknown>,
        options?: { orchestrationRequestId?: string }
      ) => {
        const response = await dispatcher.dispatch(
          orchestrationRequest(method, params, {
            requestId: options?.orchestrationRequestId
          })
        )
        if (!response.ok) {
          throw new RuntimeRpcFailureError(response)
        }
        return response
      }
    )
})
afterEach(() => {
  h.cleanup()
  vi.unstubAllEnvs()
  process.exitCode = 0
})
async function cli(...args: string[]) {
  const stdout = vi.spyOn(console, 'log').mockImplementation(() => {})
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = 0
  try {
    await main(['orchestration', ...args, '--json'])
    const text = stdout.mock.calls.map((call) => call.join(' ')).join('\n')
    const parsed: unknown = text ? JSON.parse(text) : null
    return { code: Number(process.exitCode), parsed }
  } finally {
    stdout.mockRestore()
    stderr.mockRestore()
  }
}
async function start(external = false) {
  const taskId = h.db.createTask({ runId: h.activeRunId, spec: 'fixture worker task' }).id
  const args = external ? ['--terminal', 'term_worker'] : ['--agent', 'codex']
  const started = await cli('worker-start', '--task', taskId, '--from', 'term_coord', ...args)
  expect(started.code, JSON.stringify(started.parsed)).toBe(0)
  const dispatchId = resultOf(started.parsed).dispatchId
  if (typeof dispatchId !== 'string') {
    throw new Error('Missing canonical dispatch id')
  }
  return { taskId, dispatchId }
}
it('starts an owned worker, inspects it and reads its bounded output through the CLI', async () => {
  const { taskId, dispatchId } = await start()
  expect(h.db.getWorkerDispatch(dispatchId)).toMatchObject({ state: 'ready' })
  expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)).toMatchObject({
    ownership_state: 'owned',
    terminal_handle: 'term_worker'
  })
  expect(h.runtime.createTerminal).toHaveBeenCalledTimes(1)
  const shown = await cli('worker-show', '--dispatch', dispatchId)
  expect(shown.code).toBe(0)
  expect(resultOf(shown.parsed)).toMatchObject({ worker: { state: 'ready' } })
  const read = await cli(
    'worker-read',
    '--dispatch',
    dispatchId,
    '--source',
    'terminal',
    '--limit',
    '2'
  )
  expect(read.code).toBe(0)
  expect(JSON.stringify(read.parsed)).toContain('worker output line 1')
  expect(h.db.getTask(taskId)).toBeDefined()
  expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
})
it('archives and closes only the settled owned terminal and preserves its outcome', async () => {
  const { taskId, dispatchId } = await start()
  h.settle(taskId, dispatchId, 'succeeded')
  const released = await cli('worker-release', '--dispatch', dispatchId)
  expect(released.code).toBe(0)
  expect(resultOf(released.parsed)).toMatchObject({
    state: 'released',
    processAction: 'closed_agent_terminal',
    archive: { source: 'terminal', status: 'captured' }
  })
  expect(h.runtime.closeTerminal).toHaveBeenCalledExactlyOnceWith('term_worker')
  expect(h.db.getWorkerDispatch(dispatchId)).toMatchObject({ state: 'succeeded' })
  expect(resultOf((await cli('worker-release', '--dispatch', dispatchId)).parsed)).toMatchObject({
    state: 'already_released',
    processAction: 'none'
  })
  expect(h.runtime.closeTerminal).toHaveBeenCalledTimes(1)
  expect(JSON.stringify((await cli('worker-read', '--dispatch', dispatchId)).parsed)).toContain(
    'worker output line 1'
  )
})
it('retains a settled worker without closing its terminal', async () => {
  const { taskId, dispatchId } = await start()
  h.settle(taskId, dispatchId, 'succeeded')
  const retained = await cli('worker-retain', '--dispatch', dispatchId)
  expect(retained.code).toBe(0)
  expect(resultOf(retained.parsed)).toMatchObject({ state: 'retained', processAction: 'none' })
  expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
  expect(h.db.getWorkerDispatch(dispatchId)).toMatchObject({ state: 'succeeded' })
})
it('never closes a reused external terminal during release', async () => {
  const { taskId, dispatchId } = await start(true)
  h.settle(taskId, dispatchId, 'succeeded')
  expect(resultOf((await cli('worker-release', '--dispatch', dispatchId)).parsed)).toMatchObject({
    state: 'retained',
    reason: 'external_terminal',
    processAction: 'none'
  })
  expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
})
it('refuses active release and leaves its ownership and resources intact', async () => {
  const { dispatchId } = await start()
  expect((await cli('worker-release', '--dispatch', dispatchId)).code).toBe(1)
  expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)).toMatchObject({
    release_state: 'not_requested',
    ownership_state: 'owned'
  })
  expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
})
it('reports an unverified close as stop_unknown with exit 1', async () => {
  const { dispatchId } = await start()
  vi.mocked(h.runtime.closeTerminal).mockResolvedValue({
    handle: 'term_worker',
    tabId: 'tab_worker',
    ptyKilled: false,
    ptyStopVerdict: 'unverifiable',
    ptyStopReason: 'fixture relay unavailable'
  })
  const stopped = await cli('worker-stop', '--dispatch', dispatchId)
  expect(stopped.code).toBe(1)
  expect(resultOf(stopped.parsed)).toMatchObject({ state: 'stop_unknown' })
  expect(h.db.getWorkerDispatch(dispatchId)).toMatchObject({ state: 'stop_unknown' })
  expect(h.runtime.closeTerminal).toHaveBeenCalledExactlyOnceWith('term_worker')
})
it('settles an exactly confirmed stop without closing any unrelated terminal', async () => {
  const { dispatchId } = await start()
  const stopped = await cli('worker-stop', '--dispatch', dispatchId)
  expect(stopped.code).toBe(0)
  expect(resultOf(stopped.parsed)).toMatchObject({ state: 'stopped' })
  expect(h.db.getWorkerDispatch(dispatchId)).toMatchObject({ state: 'stopped' })
  expect(h.runtime.closeTerminal).toHaveBeenCalledExactlyOnceWith('term_worker')
})
it('abandons the dispatch without claiming the process exited or closing it', async () => {
  const { dispatchId } = await start()
  const abandoned = await cli('worker-abandon', '--dispatch', dispatchId)
  expect(abandoned.code).toBe(0)
  expect(resultOf(abandoned.parsed)).toMatchObject({ state: 'abandoned' })
  expect(h.db.getWorkerDispatch(dispatchId)).toMatchObject({ state: 'abandoned' })
  expect(h.runtime.closeTerminal).not.toHaveBeenCalled()
  expect(h.db.getWorkerTerminalResourceByOwner(dispatchId)?.ownership_state).not.toBe('released')
})
