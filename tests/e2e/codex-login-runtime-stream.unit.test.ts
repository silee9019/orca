import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, specPaths } from '../../src/cli/args'
import { dispatch } from '../../src/cli/dispatch'
import { COMMAND_SPECS } from '../../src/cli/specs'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import type { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { CODEX_LOGIN_OBSERVATION_METHODS } from '../../src/main/runtime/rpc/methods/codex-login-observation'
import { TCC_THRESHOLD_OBSERVATION_METHODS } from '../../src/main/runtime/rpc/methods/tcc-threshold-observation'
import {
  handleTccPromptForTests,
  resetTccPromptNoticeForTests
} from '../../src/main/macos-tcc-prompt-notice'
import { defineMethod, defineStreamingMethod } from '../../src/main/runtime/rpc/core'
vi.mock('../../src/main/persistence', () => ({
  getCanonicalUserDataPath: () => '/fixture-tcc-unused'
}))
vi.mock('../../src/main/codex-accounts/fs-utils', () => ({ writeFileAtomically: vi.fn() }))
vi.mock('../../src/main/macos-tcc-prompt-watch', () => ({ MacosTccPromptWatch: class {} }))
afterEach(() => vi.restoreAllMocks())
it('uses actual UnixSocketTransport admission and dispatcher, preserves correlated observers and unary calls, and releases capacity on disconnect', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'orca-rs-'))
  const listeners = new Set<(pending: boolean, revision: number) => void>()
  const observeCodexLogin = (listener: (pending: boolean, revision: number) => void) => {
    listeners.add(listener)
    listener(false, 0)
    return () => {
      listeners.delete(listener)
    }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: websocket is disabled; the actual RPC server and dispatcher use only these lifecycle and fixed-domain operations in this fixture.
  const runtime = {
    getRuntimeId: () => 'fixture-runtime',
    getStartedAt: () => 0,
    configureNotificationDismissalStore: () => {},
    observeCodexLogin
  } as unknown as OrcaRuntimeService
  const server = new OrcaRuntimeRpcServer({
    runtime,
    userDataPath: dir,
    enableWebSocket: false,
    longPollCap: 2,
    keepaliveIntervalMs: 25,
    methods: [
      ...CODEX_LOGIN_OBSERVATION_METHODS,
      defineMethod({ name: 'fixture.read', params: null, handler: () => ({ read: true }) }),
      defineStreamingMethod({
        name: 'fixture.otherStream',
        params: null,
        handler: () => {
          throw new Error('must not run')
        }
      })
    ]
  })
  await server.start()
  const client = new RuntimeClient(dir, 1000, null, null)
  const abortA = new AbortController()
  const abortB = new AbortController()
  const a = vi.fn()
  const b = vi.fn()
  try {
    const pendingA = client.observeCodexLogin(2000, abortA.signal, a)
    const pendingB = client.observeCodexLogin(2000, abortB.signal, b)
    await vi.waitFor(() => {
      expect(a).toHaveBeenCalledTimes(1)
      expect(b).toHaveBeenCalledTimes(1)
    })
    for (const listener of listeners) {
      listener(true, 1)
      listener(true, 2)
    }
    await vi.waitFor(() => {
      expect(a).toHaveBeenCalledTimes(3)
      expect(b).toHaveBeenCalledTimes(3)
    })
    expect(a.mock.calls.map(([e]) => e.revision)).toEqual([0, 1, 2])
    expect(b.mock.calls.map(([e]) => e.revision)).toEqual([0, 1, 2])
    await expect(
      client.observeCodexLogin(500, new AbortController().signal, vi.fn())
    ).rejects.toMatchObject({ code: 'runtime_busy' })
    expect((await client.call('fixture.read')).result).toEqual({ read: true })
    await expect(client.call('fixture.unknown')).rejects.toMatchObject({ code: 'method_not_found' })
    await expect(client.call('fixture.otherStream')).rejects.toMatchObject({
      code: 'method_not_supported'
    })
    abortA.abort()
    expect(await pendingA).toBe('cancelled')
    await vi.waitFor(() => expect(listeners.size).toBe(1))
    const c = new AbortController()
    const received = vi.fn(() => c.abort())
    expect(await client.observeCodexLogin(500, c.signal, received)).toBe('cancelled')
    expect(received).toHaveBeenCalledExactlyOnceWith({ type: 'ready', pending: false, revision: 0 })
    abortB.abort()
    expect(await pendingB).toBe('cancelled')
    await vi.waitFor(() => expect(listeners.size).toBe(0))
  } finally {
    abortA.abort()
    abortB.abort()
    await server.stop()
    await rm(dir, { recursive: true, force: true })
  }
})

it('delivers original TCC threshold events through the actual socket and stops observing on abort without claiming notices', async () => {
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get: (target, key) => (key === 'platform' ? 'darwin' : Reflect.get(target, key))
    })
  )
  resetTccPromptNoticeForTests()
  const dir = await mkdtemp(join(tmpdir(), 'orca-tc-'))
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the socket fixture uses only these runtime lifecycle operations.
  const runtime = {
    getRuntimeId: () => 'fixture-tcc',
    getStartedAt: () => 0,
    configureNotificationDismissalStore: () => {}
  } as unknown as OrcaRuntimeService
  const server = new OrcaRuntimeRpcServer({
    runtime,
    userDataPath: dir,
    enableWebSocket: false,
    methods: TCC_THRESHOLD_OBSERVATION_METHODS
  })
  const abort = new AbortController()
  try {
    await server.start()
    const client = new RuntimeClient(dir, 1000, null, null)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const parsed = parseArgs(
      ['permissions', 'tcc', 'observe', '--timeout', '250', '--json'],
      COMMAND_SPECS.flatMap(specPaths),
      COMMAND_SPECS
    )
    const pending = dispatch(parsed.commandPath, {
      client,
      cwd: dir,
      flags: parsed.flags,
      json: true
    })
    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
      type: 'ready',
      pending: false
    })
    expect(handleTccPromptForTests()).toEqual({ promptCount: 1 })
    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(log.mock.calls[1][0]))).toMatchObject({
      type: 'threshold',
      promptCount: 1
    })
    await pending
    expect(log).toHaveBeenCalledTimes(3)
    expect(JSON.parse(String(log.mock.calls[2][0]))).toMatchObject({
      type: 'end',
      reason: 'timeout'
    })
  } finally {
    abort.abort()
    await server.stop()
    await rm(dir, { recursive: true, force: true })
    vi.unstubAllGlobals()
    resetTccPromptNoticeForTests()
  }
})
