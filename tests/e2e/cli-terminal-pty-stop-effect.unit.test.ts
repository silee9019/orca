import type { IPtyProvider } from '../../src/main/providers/types'
import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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
it('exposes an explicitly confirmed and incarnation-fenced awaited PTY stop', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-cli-pty-stop-'))
  try {
    const file = join(root, 'request.json')
    const request = {
      terminal: 't1',
      expectedPtyId: 'pty-fixture',
      expectedIncarnationId: '11111111-1111-4111-8111-111111111111',
      expectedExecutionHostId: 'local',
      keepHistory: true,
      confirm: true
    }
    await writeFile(file, JSON.stringify(request))
    mocks.call.mockResolvedValue({ ok: true, result: { settled: true, status: 'exited' } })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await main(['terminal', 'stop-pty', '--request-file', file, '--json'], root)
    expect(mocks.call).toHaveBeenCalledWith('terminal.stopPty', request)
    expect(process.exitCode).not.toBe(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

const ptyId = 'cli-stop-fixture'
const incarnationId = '11111111-1111-4111-8111-111111111111'
const { ptyIncarnationById, ptyOwnership } =
  await import('../../src/main/ipc/pty/provider/ownership-state')
const { getLocalPtyProvider, setLocalPtyProvider, sshProviders } =
  await import('../../src/main/ipc/pty/provider/registry')
const { stopRendererPtyWithEvidence } =
  await import('../../src/main/ipc/pty/runtime/renderer-pty-stop')
const { LocalPtyProvider } = await import('../../src/main/providers/local-pty-provider')
const { SessionNotFoundError } = await import('../../src/main/daemon/daemon-errors')
const priorProvider = getLocalPtyProvider()
const provider = new LocalPtyProvider()
beforeEach(() => {
  ptyIncarnationById.set(ptyId, incarnationId)
  ptyOwnership.set(ptyId, null)
  setLocalPtyProvider(provider)
})
afterEach(() => {
  setLocalPtyProvider(priorProvider)
  ptyIncarnationById.delete(ptyId)
  ptyOwnership.delete(ptyId)
})
function deps() {
  return {
    getLocalPtyProviderStartupPromise: vi.fn<() => Promise<void> | undefined>(() => undefined),
    shutdownProviderAndDetectExit: vi.fn(async () => true),
    rememberSyntheticKillExit: vi.fn(),
    sendPtyExitToRenderer: vi.fn()
  }
}
const options = {
  expectedExecutionHostId: 'local',
  expectedIncarnationId: incarnationId,
  keepHistory: true
}
it('awaits the canonical immediate shutdown and forwards keepHistory', async () => {
  const d = deps()
  let release: ((value: boolean) => void) | undefined
  d.shutdownProviderAndDetectExit.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve
      })
  )
  let completed = false
  const pending = stopRendererPtyWithEvidence(d, ptyId, options, () => {}).then((value) => {
    completed = true
    return value
  })
  await Promise.resolve()
  expect(completed).toBe(false)
  expect(d.shutdownProviderAndDetectExit).toHaveBeenCalledWith(provider, ptyId, {
    immediate: true,
    keepHistory: true
  })
  release?.(true)
  expect(await pending).toEqual({ settled: true, status: 'exited' })
})
it('preserves synthesized exit as unverifiable', async () => {
  const d = deps()
  d.shutdownProviderAndDetectExit.mockResolvedValue(false)
  expect(await stopRendererPtyWithEvidence(d, ptyId, options, () => {})).toEqual({
    settled: true,
    status: 'unverifiable'
  })
  expect(d.sendPtyExitToRenderer).toHaveBeenCalledOnce()
})
it('does not route a detached SSH PTY to the local provider or infer death', async () => {
  const d = deps()
  ptyOwnership.set(ptyId, 'cli-stop-detached-ssh')
  expect(sshProviders.has('cli-stop-detached-ssh')).toBe(false)
  expect(
    await stopRendererPtyWithEvidence(
      d,
      ptyId,
      { ...options, expectedExecutionHostId: 'ssh:cli-stop-detached-ssh' },
      () => {}
    )
  ).toEqual({
    settled: true,
    status: 'unverifiable'
  })
  expect(d.shutdownProviderAndDetectExit).not.toHaveBeenCalled()
  expect(d.sendPtyExitToRenderer).toHaveBeenCalledOnce()
})
it('refuses a replacement incarnation after provider startup without invoking shutdown', async () => {
  const d = deps()
  d.getLocalPtyProviderStartupPromise.mockImplementation(async () => {
    ptyIncarnationById.set(ptyId, '22222222-2222-4222-8222-222222222222')
  })
  await expect(stopRendererPtyWithEvidence(d, ptyId, options, () => {})).rejects.toThrow(
    'incarnation_changed'
  )
  expect(d.shutdownProviderAndDetectExit).not.toHaveBeenCalled()
  expect(d.sendPtyExitToRenderer).not.toHaveBeenCalled()
})
it('refuses a changed owner after startup and before stop effects', async () => {
  const d = deps()
  let valid = true
  d.getLocalPtyProviderStartupPromise.mockImplementation(async () => {
    valid = false
  })
  await expect(
    stopRendererPtyWithEvidence(d, ptyId, options, () => {
      if (!valid) {
        throw new Error('owner changed')
      }
    })
  ).rejects.toThrow('owner changed')
  expect(d.shutdownProviderAndDetectExit).not.toHaveBeenCalled()
})
it('preserves provider errors and live ownership for a retry', async () => {
  const d = deps()
  d.shutdownProviderAndDetectExit.mockRejectedValue(new Error('connection lost'))
  await expect(stopRendererPtyWithEvidence(d, ptyId, options, () => {})).rejects.toThrow(
    'connection lost'
  )
  expect(ptyIncarnationById.get(ptyId)).toBe(incarnationId)
  expect(ptyOwnership.has(ptyId)).toBe(true)
  expect(d.sendPtyExitToRenderer).not.toHaveBeenCalled()
})
it('does not promote legacy error text to execution-host exit evidence', async () => {
  const d = deps()
  d.shutdownProviderAndDetectExit.mockRejectedValue(new Error('Session not found'))
  expect(await stopRendererPtyWithEvidence(d, ptyId, options, () => {})).toEqual({
    settled: true,
    status: 'unverifiable'
  })
})
it('accepts typed absence evidence from the owning daemon', async () => {
  const d = deps()
  d.shutdownProviderAndDetectExit.mockRejectedValue(new SessionNotFoundError(ptyId))
  expect(await stopRendererPtyWithEvidence(d, ptyId, options, () => {})).toEqual({
    settled: true,
    status: 'exited'
  })
})
it('refuses missing or stale incarnation before provider selection', async () => {
  const d = deps()
  ptyIncarnationById.delete(ptyId)
  await expect(stopRendererPtyWithEvidence(d, ptyId, options, () => {})).rejects.toThrow(
    'incarnation_changed'
  )
  expect(d.getLocalPtyProviderStartupPromise).not.toHaveBeenCalled()
  expect(d.shutdownProviderAndDetectExit).not.toHaveBeenCalled()
})

it('refuses a provider ownership change after startup without falling back local', async () => {
  const d = deps()
  d.getLocalPtyProviderStartupPromise.mockImplementation(async () => {
    ptyOwnership.set(ptyId, 'another-host')
  })
  await expect(stopRendererPtyWithEvidence(d, ptyId, options, () => {})).rejects.toThrow(
    'owner_changed'
  )
  expect(d.shutdownProviderAndDetectExit).not.toHaveBeenCalled()
})

const { createRuntime, syncSinglePty, TEST_WORKTREE_ID } =
  await import('../../src/main/runtime/orca-runtime-test-fixtures.spec')
const { RpcDispatcher } = await import('../../src/main/runtime/rpc/dispatcher')
const { TERMINAL_PTY_STOP_METHODS } =
  await import('../../src/main/runtime/rpc/methods/terminal-pty-stop')
const { RuntimeRpcFailureError } = await import('../../src/cli/runtime/types')
it.each([true, false])(
  'connects CLI through real RPC/runtime to canonical provider stop (exit observed %s)',
  async (observed) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-cli-pty-stop-rpc-'))
    try {
      const runtime = createRuntime()
      const d = deps()
      d.shutdownProviderAndDetectExit.mockResolvedValue(observed)
      runtime.setPtyController({
        write: () => {
          throw new Error('Unexpected write')
        },
        kill: () => {
          throw new Error('Unexpected fire-and-forget kill')
        },
        getForegroundProcess: async () => null,
        stopRendererOwnedPty: (id, opts, assertOwner) =>
          stopRendererPtyWithEvidence(d, id, opts, assertOwner)
      })
      syncSinglePty(runtime, ptyId)
      runtime.registerPty(ptyId, TEST_WORKTREE_ID, null, {
        tabId: 'tab-1',
        leafId: 'pane:1',
        incarnationId
      })
      const terminal = (await runtime.listTerminals()).terminals[0].handle
      const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_PTY_STOP_METHODS })
      mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
        const response = await dispatcher.dispatch({
          id: 'stop-fixture',
          method,
          params,
          authToken: 'fixture'
        })
        if (!response.ok) {
          throw new RuntimeRpcFailureError(response)
        }
        return response
      })
      const file = join(root, 'request.json')
      const request = {
        terminal,
        expectedPtyId: ptyId,
        expectedIncarnationId: incarnationId,
        expectedExecutionHostId: 'local',
        keepHistory: false,
        confirm: true
      }
      vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await writeFile(file, JSON.stringify({ ...request, confirm: false }))
      await main(['terminal', 'stop-pty', '--request-file', file, '--json'], root)
      expect(process.exitCode).toBe(1)
      expect(mocks.call).not.toHaveBeenCalled()
      process.exitCode = undefined
      await writeFile(
        file,
        JSON.stringify({ ...request, expectedExecutionHostId: 'ssh:wrong-host' })
      )
      await main(['terminal', 'stop-pty', '--request-file', file, '--json'], root)
      expect(process.exitCode).toBe(1)
      expect(d.shutdownProviderAndDetectExit).not.toHaveBeenCalled()
      process.exitCode = undefined
      await writeFile(file, JSON.stringify(request))
      await main(['terminal', 'stop-pty', '--request-file', file, '--json'], root)
      expect(process.exitCode).toBe(observed ? undefined : 1)
      const output = JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))
      expect(output.result).toMatchObject({
        settled: true,
        status: observed ? 'exited' : 'unverifiable'
      })
      expect(d.shutdownProviderAndDetectExit).toHaveBeenCalledWith(provider, ptyId, {
        immediate: true,
        keepHistory: false
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
)

const { shutdownProviderAndDetectExit } =
  await import('../../src/main/ipc/pty/provider/shutdown-detect')
type ExitListener = Parameters<IPtyProvider['onExit']>[0]
class ExitRecordingProvider extends LocalPtyProvider {
  listeners = new Set<ExitListener>()
  reportedIncarnation = incarnationId
  override onExit: IPtyProvider['onExit'] = (listener) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  override shutdown: IPtyProvider['shutdown'] = async (id) => {
    for (const listener of this.listeners) {
      listener({ id, code: 0, incarnationId: this.reportedIncarnation })
    }
  }
}
it.each([true, false])(
  'uses canonical shutdown observation and ignores a mismatched exit incarnation (%s)',
  async (matches) => {
    const recording = new ExitRecordingProvider()
    recording.reportedIncarnation = matches ? incarnationId : '22222222-2222-4222-8222-222222222222'
    setLocalPtyProvider(recording)
    const d = { ...deps(), shutdownProviderAndDetectExit }
    expect(await stopRendererPtyWithEvidence(d, ptyId, options, () => {})).toEqual({
      settled: true,
      status: matches ? 'exited' : 'unverifiable'
    })
    expect(recording.listeners.size).toBe(0)
  }
)
