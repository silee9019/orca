import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createOrchestrationRpcHarness } from '../../src/main/runtime/rpc/methods/orchestration/rpc-test-harness'
import { ORCHESTRATION_METHODS } from '../../src/main/runtime/rpc/methods/orchestration'
import { OrchestrationDb } from '../../src/main/runtime/orchestration/db'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { ORCHESTRATION_CONTRACT_VERSION } from '../../src/shared/protocol-version'
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
const harness = createOrchestrationRpcHarness()
let root: string
let db: OrchestrationDb
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-orchestration-'))
  const fixture = harness.setup(false, join(root, 'orchestration.db'))
  db = fixture.db
  const rpc = new RpcDispatcher({ runtime: fixture.runtime, methods: ORCHESTRATION_METHODS })
  state.call.mockImplementation(
    async (method: string, params: unknown, options?: { orchestrationRequestId?: string }) => {
      const response = await rpc.dispatch({
        id: randomUUID(),
        authToken: 'fixture',
        method,
        params,
        orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION,
        orchestrationRequestId: options?.orchestrationRequestId ?? randomUUID()
      })
      if (!response.ok) {
        throw new RuntimeRpcFailureError(response)
      }
      return response
    }
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('ORCA_PANE_KEY', '')
  vi.stubEnv('ORCA_STRUCTURED_SESSION', '')
  vi.stubEnv('ORCA_AGENT_SESSION_ID', '')
  process.exitCode = undefined
})
afterEach(async () => {
  harness.cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
async function command(...args: string[]) {
  vi.mocked(console.log).mockClear()
  const caller = ['run-list', 'run-show', 'inbox'].includes(args[0]) ? [] : ['--from', 'term_coord']
  await main(['orchestration', ...args, ...caller, '--json'], root)
  expect(process.exitCode, JSON.stringify(vi.mocked(console.error).mock.calls)).toBeUndefined()
  const output = vi.mocked(console.log).mock.calls.at(-1)?.[0]
  if (typeof output !== 'string') {
    throw new Error('Missing CLI JSON')
  }
  return JSON.parse(output)
}
it('persists Run, Task and Gate effects through the public CLI and a database reopen', async () => {
  const {
    result: { run }
  } = await command('run-create', '--objective', '격리 fixture')
  expect(db.getRun(run.id)?.objective).toBe('격리 fixture')
  expect((await command('run-current')).result.run.id).toBe(run.id)
  expect((await command('run-list')).result.runs).toContainEqual(
    expect.objectContaining({ id: run.id })
  )
  expect((await command('run-show', '--id', run.id)).result.run.id).toBe(run.id)
  expect((await command('run-use', '--id', run.id)).result.run.id).toBe(run.id)
  const {
    result: { task }
  } = await command('task-create', '--spec', 'fixture task', '--run', run.id)
  expect(db.getTask(task.id)?.spec).toBe('fixture task')
  expect((await command('task-list', '--run', run.id)).result.tasks).toContainEqual(
    expect.objectContaining({ id: task.id })
  )
  const {
    result: { gate }
  } = await command('gate-create', '--task', task.id, '--question', 'Proceed?')
  await command('gate-resolve', '--id', gate.id, '--resolution', 'approved')
  const {
    result: { gates }
  } = await command('gate-list', '--run', run.id)
  expect(gates).toContainEqual(
    expect.objectContaining({ id: gate.id, status: 'resolved', resolution: 'approved' })
  )
  await command('task-update', '--id', task.id, '--status', 'completed', '--run', run.id)
  expect(db.getTask(task.id)?.status).toBe('completed')
  harness.cleanup()
  const reopened = new OrchestrationDb(join(root, 'orchestration.db'))
  try {
    expect(reopened.getRun(run.id)?.objective).toBe('격리 fixture')
    expect(reopened.getTask(task.id)?.spec).toBe('fixture task')
  } finally {
    reopened.close()
  }
})
it('stores a file body once on replay without echoing the private body or payload', async () => {
  const {
    result: { run }
  } = await command('run-create', '--objective', 'fixture')
  const body = '한글 private body fixture\n둘째 줄'
  await writeFile(join(root, 'body.txt'), body)
  const requestId = randomUUID()
  const args = [
    'send',
    '--subject',
    'fixture',
    '--to',
    `run:${run.id}`,
    '--body-file',
    'body.txt',
    '--retry-request',
    requestId
  ]
  const first = await command(...args)
  expect(JSON.stringify(first)).not.toContain('private body fixture')
  expect(db.getMessageById(first.result.message.id)?.body).toBe(body)
  const inbox = await command('inbox')
  expect(JSON.stringify(inbox)).toContain('private body fixture')
  const replay = await command(...args)
  expect(replay.result.message.id).toBe(first.result.message.id)
  const reply = await command('reply', '--id', first.result.message.id, '--body-file', 'body.txt')
  expect(JSON.stringify(reply)).not.toContain('private body fixture')
  expect(db.getMessageById(reply.result.message.id)?.body).toBe(body)
  harness.cleanup()
  const reopened = new OrchestrationDb(join(root, 'orchestration.db'))
  try {
    expect(reopened.getMessageById(first.result.message.id)?.body).toBe(body)
  } finally {
    reopened.close()
  }
})
