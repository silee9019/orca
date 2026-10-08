import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { agentHookServer, _internals } from '../../src/main/agent-hooks/server'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import type { ExecutionHostId } from '../../src/shared/execution-host'
import { main } from '../../src/cli/index'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
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
const leafId = '11111111-1111-4111-8111-111111111111'
const paneKey = `reconcile-tab:${leafId}`
const worktreeId = 'folder:fixture'
let root: string
let foreground: string | null
let onForeground: (() => void) | undefined
let incarnationId: string
let executionHostId: ExecutionHostId | undefined
function seed(prompt = 'private reconcile canary') {
  agentHookServer.ingestRemote(
    {
      paneKey,
      tabId: 'reconcile-tab',
      worktreeId,
      providerSession: { key: 'session_id', id: 'private-resume-session' },
      payload: { state: 'working', agentType: 'claude', prompt }
    },
    'fixture-ssh'
  )
  return observedRequest()
}
function observedRequest() {
  const row = agentHookServer.getStatusSnapshot().find((item) => item.paneKey === paneKey)
  if (!row?.observation) {
    throw new Error('Missing canonical observation fixture')
  }
  return {
    terminal: 'fixture-terminal',
    expectedIncarnationId: 'fixture-incarnation',
    paneKey,
    receivedAt: row.receivedAt,
    stateStartedAt: row.stateStartedAt,
    expectedObservation: {
      authorityId: row.observation.authorityId,
      incarnation: row.observation.incarnation,
      revision: row.observation.revision
    },
    confirm: true
  }
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-status-reconcile-'))
  _internals.resetCachesForTests()
  foreground = 'bash'
  onForeground = undefined
  incarnationId = 'fixture-incarnation'
  executionHostId = 'ssh:fixture-ssh'
  const runtime = new OrcaRuntimeService()
  vi.spyOn(runtime, 'showTerminal').mockImplementation(async () => ({
    handle: 'fixture-terminal',
    ptyId: 'fixture-pty',
    incarnationId,
    worktreeId,
    worktreePath: '/fixture',
    branch: '',
    tabId: 'reconcile-tab',
    leafId,
    title: null,
    connected: true,
    writable: true,
    lastOutputAt: null,
    preview: '',
    paneRuntimeId: 1,
    rendererGraphEpoch: 1,
    executionHostId
  }))
  vi.spyOn(runtime, 'getConfirmedTerminalForegroundProcess').mockImplementation(async () => {
    onForeground?.()
    return foreground
  })
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const { AGENT_STATUS_RECONCILE_METHODS } =
      await import('../../src/main/runtime/rpc/methods/agent-status-reconcile')
    const { AGENT_STATUS_CLI_METHODS } =
      await import('../../src/main/runtime/rpc/methods/agent-status-cli')
    const response = await new RpcDispatcher({
      runtime,
      methods: [...AGENT_STATUS_RECONCILE_METHODS, ...AGENT_STATUS_CLI_METHODS]
    }).dispatch({ id: 'reconcile', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  process.exitCode = undefined
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
})
afterEach(async () => {
  _internals.resetCachesForTests()
  process.exitCode = undefined
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})
async function command(request: unknown) {
  const file = join(root, 'request.json')
  await writeFile(file, JSON.stringify(request))
  vi.mocked(console.log).mockClear()
  await main(['agent', 'status', 'reconcile-ended', '--request-file', file, '--json'], root)
  const output = String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
  expect(output).not.toContain('private reconcile canary')
  expect(output).not.toContain('private-resume-session')
  return JSON.parse(output)
}
it('clears canonical live claims after fresh shell confirmation and retains resume identity', async () => {
  expect(await command(seed())).toMatchObject({ ok: true, result: { reconciled: true } })
  const row = agentHookServer.getStatusSnapshot().find((item) => item.paneKey === paneKey)
  expect(row).toMatchObject({
    providerSessionOnly: true,
    providerSession: { id: 'private-resume-session' }
  })
})
it.each([null, '', '   ', 'claude', 'node'])(
  'refuses unconfirmed or nonshell foreground %s',
  async (processName) => {
    const baseline = seed()
    foreground = processName
    expect(await command(baseline)).toMatchObject({ ok: false })
    expect(agentHookServer.getStatusSnapshot()[0].providerSessionOnly).not.toBe(true)
  }
)
it('refuses a stale baseline before retiring live claims', async () => {
  const baseline = seed()
  seed('new turn')
  expect(await command(baseline)).toMatchObject({ ok: false })
  expect(agentHookServer.getStatusSnapshot()[0].providerSessionOnly).not.toBe(true)
})
it('refuses a new canonical observation arriving during foreground confirmation', async () => {
  const baseline = seed()
  onForeground = () => {
    seed('new turn')
  }
  expect(await command(baseline)).toMatchObject({ ok: false })
  expect(agentHookServer.getStatusSnapshot()[0].providerSessionOnly).not.toBe(true)
})
it('refuses a replacement PTY incarnation observed during confirmation', async () => {
  const baseline = seed()
  onForeground = () => {
    incarnationId = 'replacement'
  }
  expect(await command(baseline)).toMatchObject({ ok: false })
  expect(agentHookServer.getStatusSnapshot()[0].providerSessionOnly).not.toBe(true)
})
it('rejects mismatched pane identity and absent confirmation', async () => {
  const baseline = seed()
  expect(await command({ ...baseline, paneKey: `other-tab:${leafId}` })).toMatchObject({
    ok: false
  })
  mocks.call.mockClear()
  expect(await command({ ...baseline, confirm: false })).toMatchObject({ ok: false })
  expect(mocks.call).not.toHaveBeenCalled()
})
it('fails once against an old host', async () => {
  mocks.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  expect(await command(seed())).toMatchObject({ ok: false })
  expect(mocks.call).toHaveBeenCalledTimes(1)
})

it('rejects a mismatched observation revision even when timestamp fields match', async () => {
  const baseline = seed()
  expect(
    await command({
      ...baseline,
      expectedObservation: {
        ...baseline.expectedObservation,
        revision: baseline.expectedObservation.revision + 1
      }
    })
  ).toMatchObject({ ok: false })
  expect(agentHookServer.getStatusSnapshot()[0].providerSessionOnly).not.toBe(true)
})
it('exposes only observation metadata needed to build the guarded request in the public list', async () => {
  const baseline = seed()
  await main(['agent', 'status', 'list', '--json'], root)
  const output = String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
  expect(JSON.parse(output).result[0].observation).toEqual(baseline.expectedObservation)
  expect(output).not.toContain('private reconcile canary')
  expect(output).not.toContain('private-resume-session')
})

it.each(['local', 'ssh:other', 'runtime:peer', undefined] as const)(
  'refuses status cleanup when terminal host %s does not identify the row owner',
  async (hostId) => {
    const baseline = seed()
    executionHostId = hostId
    expect(await command(baseline)).toMatchObject({ ok: false })
    expect(agentHookServer.getStatusSnapshot()[0].providerSessionOnly).not.toBe(true)
  }
)
it('refuses a host rebind during foreground confirmation even if the PTY ID and incarnation match', async () => {
  const baseline = seed()
  onForeground = () => {
    executionHostId = 'ssh:other'
  }
  expect(await command(baseline)).toMatchObject({ ok: false })
  expect(agentHookServer.getStatusSnapshot()[0].providerSessionOnly).not.toBe(true)
})

it('reconciles a local canonical row only against a known local terminal', async () => {
  executionHostId = 'local'
  agentHookServer.ingestTerminalStatus({
    paneKey,
    tabId: 'reconcile-tab',
    worktreeId,
    payload: { state: 'working', agentType: 'claude', prompt: 'private reconcile canary' }
  })
  expect(await command(observedRequest())).toMatchObject({ ok: true, result: { reconciled: true } })
  expect(agentHookServer.getStatusSnapshot()).toHaveLength(0)
})
