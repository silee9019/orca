import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { PTY_PROVIDER_SESSION_METHODS } from '../../src/main/runtime/rpc/methods/pty-provider-sessions'
import { listPtyProviderSessions } from '../../src/main/ipc/pty/listed-sessions'
import { ptyOwnership } from '../../src/main/ipc/pty/provider/ownership-state'
import type { PtyProcessInfo } from '../../src/main/providers/types'
import type { AgentSessionOwnerBinding } from '../../src/shared/agent-session-host-authority'
import { AGENT_SESSION_CLAIM_DIGEST_VERSION } from '../../src/shared/agent-session-host-authority'

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  getProvider: vi.fn(),
  registered: vi.fn()
}))
vi.mock('../../src/main/ipc/pty/provider/registry', async (original) => ({
  ...(await original()),
  getProvider: mocks.getProvider,
  registeredPtyProviders: mocks.registered
}))
vi.mock('../../src/cli/runtime-client', async () => ({
  ...(await import('../../src/cli/runtime/types.js')),
  RuntimeClient: class {
    readonly isRemote = false
    call = mocks.call
  }
}))
let root: string
let runtime: OrcaRuntimeService
let rows: PtyProcessInfo[]
const startup = vi.fn()
const localList = vi.fn()
const remoteList = vi.fn()
const authoritative = vi.fn()
const local = { listProcesses: localList, providesAgentSessionOwnerListings: authoritative }
const remote = { listProcesses: remoteList, providesAgentSessionOwnerListings: authoritative }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-provider-sessions-'))
  runtime = new OrcaRuntimeService()
  rows = [
    {
      id: 'provider-fixture-pty',
      cwd: '/private/fixture',
      title: 'private title',
      worktreeId: 'folder:fixture'
    }
  ]
  startup.mockReset().mockResolvedValue(undefined)
  authoritative.mockReset().mockReturnValue(false)
  localList.mockReset().mockImplementation(async () => rows)
  remoteList.mockReset().mockImplementation(async () => rows)
  mocks.registered.mockReset().mockReturnValue([])
  mocks.getProvider.mockReset().mockImplementation((connectionId: string | null) => {
    if (connectionId === null) {
      return local
    }
    if (connectionId === 'fixture-ssh') {
      return remote
    }
    throw new Error('fixture_provider_unavailable')
  })
  Object.defineProperty(runtime, 'ptyController', {
    value: {
      listSessions: (scope?: { connectionId: string | null }) =>
        listPtyProviderSessions(startup, scope)
    },
    configurable: true
  })
  const dispatcher = new RpcDispatcher({ runtime, methods: PTY_PROVIDER_SESSION_METHODS })
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
})
afterEach(async () => {
  for (const row of rows) {
    ptyOwnership.delete(row.id)
  }
  await rm(root, { recursive: true, force: true })
  vi.restoreAllMocks()
  process.exitCode = 0
})
async function cli(request: unknown) {
  const path = join(root, 'request.json')
  await writeFile(path, JSON.stringify(request), { mode: 0o600 })
  const stdout = vi.spyOn(console, 'log').mockImplementation(() => {})
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = 0
  try {
    await main(['terminal', 'provider-sessions', '--request-file', path, '--json'])
    const text = stdout.mock.calls.map((call) => call.join(' ')).join('\n')
    const parsed: unknown = text ? JSON.parse(text) : null
    return { code: Number(process.exitCode), parsed }
  } finally {
    stdout.mockRestore()
    stderr.mockRestore()
  }
}
it('lists only the selected SSH provider and refreshes canonical ownership', async () => {
  const result = await cli({ connectionId: 'fixture-ssh' })
  expect(result.code).toBe(0)
  expect(result.parsed).toMatchObject({
    ok: true,
    result: {
      scope: { connectionId: 'fixture-ssh' },
      sessions: [
        {
          ...rows[0],
          agentOwnership: 'unknown'
        }
      ]
    }
  })
  expect(remoteList).toHaveBeenCalledOnce()
  expect(localList).not.toHaveBeenCalled()
  expect(startup).not.toHaveBeenCalled()
  expect(mocks.registered).not.toHaveBeenCalled()
  expect(ptyOwnership.get(rows[0].id)).toBe('fixture-ssh')
})
it('waits for local startup before selecting the local provider', async () => {
  let release: (() => void) | undefined
  startup.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
  )
  const pending = runtime.listProviderSessions({ connectionId: null })
  expect(mocks.getProvider).not.toHaveBeenCalled()
  expect(localList).not.toHaveBeenCalled()
  if (!release) {
    throw new Error('Missing startup waiter')
  }
  release()
  expect(await pending).toMatchObject([{ id: rows[0].id, agentOwnership: 'unknown' }])
  expect(localList).toHaveBeenCalledOnce()
  expect(remoteList).not.toHaveBeenCalled()
  expect(ptyOwnership.get(rows[0].id)).toBeNull()
})
it('preserves positive owner claims and distinguishes authoritative absence', async () => {
  const owner: AgentSessionOwnerBinding = {
    claim: {
      digestVersion: AGENT_SESSION_CLAIM_DIGEST_VERSION,
      keyId: 'fixture-key',
      identityDigest: 'a'.repeat(43),
      worktreeScopeDigest: 'b'.repeat(43),
      agent: 'codex'
    },
    generation: 'fixture-generation',
    phase: 'live',
    ptyId: rows[0].id,
    surface: {
      worktreeId: 'folder:fixture',
      tabId: 'fixture-tab',
      leafId: '11111111-1111-4111-8111-111111111111',
      terminalHandle: 'term_fixture'
    }
  }
  rows[0].agentSessionOwners = [owner]
  rows.push({ id: 'provider-fixture-plain', cwd: '/fixture', title: 'shell' })
  authoritative.mockReturnValue(true)
  expect((await cli({ connectionId: null })).parsed).toMatchObject({
    result: {
      sessions: [
        { id: rows[0].id, agentOwnership: 'present' },
        { id: rows[1].id, agentOwnership: 'absent' }
      ]
    }
  })
})
it('rejects a selected-provider error without substituting local inventory', async () => {
  remoteList.mockRejectedValue(new Error('fixture_relay_unavailable'))
  expect((await cli({ connectionId: 'fixture-ssh' })).code).toBe(1)
  expect((await cli({ connectionId: 'missing' })).code).toBe(1)
  expect(localList).not.toHaveBeenCalled()
})
it('rejects malformed rows instead of publishing an invented inventory', async () => {
  remoteList.mockResolvedValue([{ id: 7, cwd: '/fixture', title: 'invalid' }])
  expect((await cli({ connectionId: 'fixture-ssh' })).code).toBe(1)
  expect(ptyOwnership.has(rows[0].id)).toBe(false)
})
it.each([
  {},
  { connectionId: '' },
  { connectionId: ' ' },
  { connectionId: 42 },
  { connectionId: null, all: true }
])('refuses malformed scope before RPC: %j', async (request) => {
  expect((await cli(request)).code).toBe(1)
  expect(mocks.call).not.toHaveBeenCalled()
})
it('refuses an unavailable runtime controller instead of using another owner', async () => {
  Object.defineProperty(runtime, 'ptyController', { value: null })
  expect((await cli({ connectionId: null })).code).toBe(1)
  expect(localList).not.toHaveBeenCalled()
})
it('surfaces an old-host method error once without another provider attempt', async () => {
  mocks.call.mockImplementation(async () => {
    throw new RuntimeRpcFailureError({
      id: 'fixture',
      ok: false,
      error: { code: 'method_not_found', message: 'fixture old host' }
    })
  })
  expect((await cli({ connectionId: null })).code).toBe(1)
  expect(mocks.call).toHaveBeenCalledTimes(1)
  expect(localList).not.toHaveBeenCalled()
})

it('preserves explicitly requested diagnostic inventory and labels its swallowed remote errors', async () => {
  mocks.registered.mockReturnValue([
    { provider: local, connectionId: null },
    { provider: remote, connectionId: 'fixture-ssh' }
  ])
  remoteList.mockRejectedValue(new Error('fixture relay unavailable'))
  const result = await cli({ diagnostic: true })
  expect(result.code).toBe(0)
  expect(result.parsed).toMatchObject({
    result: {
      scope: null,
      complete: false,
      sessions: [{ id: rows[0].id, agentOwnership: 'unknown' }]
    }
  })
  expect(localList).toHaveBeenCalledOnce()
  expect(remoteList).toHaveBeenCalledOnce()
  expect(mocks.getProvider).not.toHaveBeenCalled()
  expect(startup).not.toHaveBeenCalled()
})
