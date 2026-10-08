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
it('exposes explicit private request-token cancellation without echoing its capability', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-cli-scan-cancel-'))
  try {
    const file = join(root, 'request.json')
    const request = {
      requestToken: '11111111-1111-4111-8111-111111111111',
      expectedRuntimeId: 'fixture-runtime',
      confirm: true
    }
    await writeFile(file, JSON.stringify(request))
    mocks.call.mockResolvedValue({
      ok: true,
      result: { cancelRequested: true, scanStopped: false }
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await main(['agent', 'history', 'cancel', '--request-file', file, '--json'], root)
    expect(mocks.call).toHaveBeenCalledWith('aiVault.cancelOwnedListSessions', request)
    expect(process.exitCode).toBeUndefined()
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(request.requestToken)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

const { createRuntime } = await import('../../src/main/runtime/orca-runtime-test-fixtures.spec')
const { runOwnedAiVaultListScan, cancelOwnedAiVaultListScan } =
  await import('../../src/main/ai-vault/owned-list-cancellation')
const { AiVaultScanCoordinator } = await import('../../src/main/ai-vault/ai-vault-scan-coordinator')
const token = '22222222-2222-4222-8222-222222222222'
const empty = { sessions: [], issues: [], scannedAt: '2026-10-08T09:56:00.000Z' }
function waitForAbort(signal?: AbortSignal): Promise<typeof empty> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('Cancelled', 'AbortError'))
    if (signal?.aborted) {
      abort()
    } else {
      signal?.addEventListener('abort', abort, { once: true })
    }
  })
}
it('cancels only the owned waiter while the canonical coalesced scan stays alive', async () => {
  const context = { runtime: createRuntime(), authenticatedCallerFingerprint: 'owner-a' }
  const coordinator = new AiVaultScanCoordinator()
  let release: ((value: typeof empty) => void) | undefined
  let shared: AbortSignal | undefined
  const start = vi.fn((signal: AbortSignal) => {
    shared = signal
    return new Promise<typeof empty>((resolve) => {
      release = resolve
    })
  })
  const first = runOwnedAiVaultListScan(context, token, (signal) =>
    coordinator.run({ key: 'scope', signal, start })
  )
  const second = coordinator.run({ key: 'scope', start })
  await Promise.resolve()
  expect(
    cancelOwnedAiVaultListScan({ ...context, authenticatedCallerFingerprint: 'owner-b' }, token)
  ).toBe(false)
  expect(
    cancelOwnedAiVaultListScan(
      { runtime: createRuntime(), authenticatedCallerFingerprint: 'owner-a' },
      token
    )
  ).toBe(false)
  expect(cancelOwnedAiVaultListScan(context, token)).toBe(true)
  expect(cancelOwnedAiVaultListScan(context, token)).toBe(false)
  await expect(first).rejects.toMatchObject({ name: 'AbortError' })
  expect(shared?.aborted).toBe(false)
  release?.(empty)
  await expect(second).resolves.toEqual(empty)
  expect(start).toHaveBeenCalledOnce()
  expect(cancelOwnedAiVaultListScan(context, token)).toBe(false)
})
it('refuses duplicate tokens without superseding their original owner', async () => {
  const context = { runtime: createRuntime() }
  const pending = runOwnedAiVaultListScan(context, token, waitForAbort)
  await expect(runOwnedAiVaultListScan(context, token, async () => empty)).rejects.toThrow(
    'owned_list_unavailable'
  )
  expect(cancelOwnedAiVaultListScan(context, token)).toBe(true)
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  await expect(runOwnedAiVaultListScan(context, token, async () => empty)).resolves.toEqual(empty)
})
it('forwards disconnect cancellation and releases failed registrations', async () => {
  const abort = new AbortController()
  const context = { runtime: createRuntime(), signal: abort.signal }
  const pending = runOwnedAiVaultListScan(context, token, waitForAbort)
  abort.abort()
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  expect(cancelOwnedAiVaultListScan(context, token)).toBe(false)
  await expect(
    runOwnedAiVaultListScan({ runtime: context.runtime }, token, async () => {
      throw new Error('scan failed')
    })
  ).rejects.toThrow('scan failed')
  expect(cancelOwnedAiVaultListScan(context, token)).toBe(false)
})
it('preserves tokenless caller behavior and signal without registering a cancellation', async () => {
  const abort = new AbortController()
  const context = { runtime: createRuntime(), signal: abort.signal }
  await expect(
    runOwnedAiVaultListScan(context, undefined, async (signal) => {
      expect(signal).toBe(abort.signal)
      return empty
    })
  ).resolves.toEqual(empty)
  expect(cancelOwnedAiVaultListScan(context, token)).toBe(false)
})
it('bounds active list registrations and releases all owned waiters after cancellation', async () => {
  const context = { runtime: createRuntime() }
  const pending = Array.from({ length: 64 }, (_, i) =>
    runOwnedAiVaultListScan(context, String(i), waitForAbort)
  )
  const settled = Promise.allSettled(pending)
  await expect(runOwnedAiVaultListScan(context, 'overflow', async () => empty)).rejects.toThrow(
    'owned_list_unavailable'
  )
  for (let i = 0; i < 64; i++) {
    expect(cancelOwnedAiVaultListScan(context, String(i))).toBe(true)
  }
  expect((await settled).every((result) => result.status === 'rejected')).toBe(true)
  await expect(runOwnedAiVaultListScan(context, token, async () => empty)).resolves.toEqual(empty)
})
const { RpcDispatcher } = await import('../../src/main/runtime/rpc/dispatcher')
const { AI_VAULT_METHODS } = await import('../../src/main/runtime/rpc/methods/ai-vault')
const { AI_VAULT_LIST_CANCEL_METHODS } =
  await import('../../src/main/runtime/rpc/methods/ai-vault-list-cancel')
const { RuntimeRpcFailureError, RuntimeClientError } = await import('../../src/cli/runtime/types')
it('cancels an actual token-owned list RPC through public CLI and clears it on settlement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-cli-scan-cancel-rpc-'))
  try {
    const runtime = createRuntime()
    vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
    let started: (() => void) | undefined
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    vi.spyOn(runtime, 'listAiVaultSessions').mockImplementation(async (_args, signal) => {
      started?.()
      return waitForAbort(signal)
    })
    const dispatcher = new RpcDispatcher({
      runtime,
      methods: [...AI_VAULT_METHODS, ...AI_VAULT_LIST_CANCEL_METHODS]
    })
    const listing = dispatcher.dispatch({
      id: 'list',
      method: 'aiVault.listSessions',
      params: { requestToken: token },
      authToken: 'fixture'
    })
    await ready
    mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
      const response = await dispatcher.dispatch({
        id: 'cancel',
        method,
        params,
        authToken: 'fixture'
      })
      if (!response.ok) {
        throw new RuntimeRpcFailureError(response)
      }
      return response
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const file = join(root, 'request.json')
    await writeFile(
      file,
      JSON.stringify({ requestToken: token, expectedRuntimeId: 'wrong-runtime', confirm: true })
    )
    await main(['agent', 'history', 'cancel', '--request-file', file, '--json'], root)
    expect(process.exitCode).toBe(1)
    process.exitCode = undefined
    await writeFile(
      file,
      JSON.stringify({
        requestToken: token,
        expectedRuntimeId: runtime.getRuntimeId(),
        confirm: true
      })
    )
    await main(['agent', 'history', 'cancel', '--request-file', file, '--json'], root)
    expect(process.exitCode).toBeUndefined()
    expect(JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0])).result).toEqual({
      cancelRequested: true,
      scanStopped: false
    })
    expect((await listing).ok).toBe(false)
    await main(['agent', 'history', 'cancel', '--request-file', file, '--json'], root)
    expect(process.exitCode).toBe(1)
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(token)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
it('refuses a token-owned list before starting it on an old host', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-cli-scan-old-host-'))
  try {
    const file = join(root, 'request.json')
    await writeFile(file, JSON.stringify({ requestToken: token }))
    mocks.call
      .mockReset()
      .mockRejectedValue(new RuntimeClientError('method_not_found', 'Unsupported on selected host'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await main(['agent', 'history', 'list', '--request-file', file, '--json'], root)
    expect(process.exitCode).toBe(1)
    expect(mocks.call).toHaveBeenCalledExactlyOnceWith('aiVault.ownedListCapabilities', {})
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('selects the addressed runtime for cancellation while preserving local hook management', async () => {
  const { isSelectedRuntimeAgentCommand } = await import('../../src/cli/agent-runtime-selection')
  expect(isSelectedRuntimeAgentCommand(['agent', 'history', 'cancel'])).toBe(true)
  expect(isSelectedRuntimeAgentCommand(['agent', 'hooks', 'install'])).toBe(false)
})
it('refuses a malformed capability receipt before starting a token-owned list', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-cli-scan-bad-capability-'))
  try {
    const file = join(root, 'request.json')
    await writeFile(file, JSON.stringify({ requestToken: token }))
    mocks.call.mockReset().mockResolvedValue({ ok: true, result: { ownedListCancellation: 0 } })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await main(['agent', 'history', 'list', '--request-file', file, '--json'], root)
    expect(process.exitCode).toBe(1)
    expect(mocks.call).toHaveBeenCalledExactlyOnceWith('aiVault.ownedListCapabilities', {})
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
