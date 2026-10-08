import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import type * as Registry from '../../src/main/ipc/pty/provider/registry'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import {
  createRuntime,
  syncSinglePty,
  TEST_WORKTREE_ID
} from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import { ptyOwnership, ptyIncarnationById } from '../../src/main/ipc/pty/provider/ownership-state'
import { installPtyWriteIpcHandlers } from '../../src/main/ipc/pty/ipc/write'
const provider = vi.hoisted(() => ({ resize: vi.fn(), getAppliedSize: vi.fn() }))
vi.mock('../../src/main/ipc/pty/provider/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof Registry>()),
  tryGetProviderForPty: () => provider
}))
it.each([
  'local',
  'ssh',
  'paired',
  'already-host',
  'mobile',
  'failed',
  'queued',
  'queued-failed',
  'queued-replaced',
  'queued-navigation',
  'no-window',
  'wrong-renderer',
  'other-runtime',
  'destroyed',
  'stale',
  'wrong-host',
  'old-host'
])('claims the registered host viewport through its canonical queue: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-host-viewport-')),
    runtime = createRuntime(),
    id = mode === 'ssh' ? 'ssh:fixture@@viewport' : 'viewport-fixture',
    host = mode === 'ssh' ? 'ssh:fixture' : 'local',
    incarnationId = 'fixture-incarnation'
  let size = { cols: 80, rows: 24 },
    failResize = false
  runtime.setPtyController({
    write: () => true,
    kill: () => {},
    getForegroundProcess: async () => null,
    getSize: () => size,
    resize: (_id, cols, rows) => {
      if (failResize) {
        return false
      }
      size = { cols, rows }
      return true
    }
  })
  syncSinglePty(runtime, id)
  const bind = (value: string) =>
    runtime.registerPty(id, TEST_WORKTREE_ID, mode === 'ssh' ? 'fixture' : null, {
      tabId: 'tab-1',
      leafId: 'pane:1',
      incarnationId: value
    })
  bind(incarnationId)
  ptyOwnership.set(id, mode === 'ssh' ? 'fixture' : null)
  ptyIncarnationById.set(id, incarnationId)
  vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
  const window = {
    isDestroyed: () => mode === 'destroyed',
    isFocused: () => false,
    isVisible: () => false,
    isMinimized: () => false,
    webContents: {
      id: mode === 'wrong-renderer' ? 422 : 421,
      isDestroyed: () => mode === 'destroyed',
      send: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn()
    }
  }
  installPtyWriteIpcHandlers({
    runtime: mode === 'other-runtime' ? createRuntime() : runtime,
    ...(mode !== 'no-window' ? { mainWindow: window } : {})
  })
  if (
    ![
      'already-host',
      'no-window',
      'wrong-renderer',
      'other-runtime',
      'destroyed',
      'stale',
      'wrong-host',
      'old-host'
    ].includes(mode)
  ) {
    await runtime.updateRemoteDesktopViewer(id, 'fixture-viewer', 'fixture-client', 40, 12)
  }
  if (mode === 'mobile') {
    await runtime.handleMobileSubscribe(id, 'fixture-phone', { cols: 50, rows: 14 })
  }
  const original = runtime.claimRemoteDesktopHost.bind(runtime)
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
      release = resolve
    }),
    queued = mode.startsWith('queued')
  const claim = vi.spyOn(runtime, 'claimRemoteDesktopHost').mockImplementation(async (...args) => {
    if (queued) {
      await gate
    }
    return original(...args)
  })
  failResize = mode === 'failed' || mode === 'queued-failed'
  provider.getAppliedSize.mockResolvedValue(size)
  for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
    vi.stubEnv(key, undefined)
  }
  vi.stubEnv('ORCA_USER_DATA_PATH', root)
  const frames: unknown[] = []
  vi.spyOn(console, 'log').mockImplementation((v) => {
    if (typeof v === 'string' && v.startsWith('{')) {
      frames.push(JSON.parse(v))
    }
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const server = new OrcaRuntimeRpcServer({
    runtime,
    userDataPath: root,
    enableWebSocket: mode === 'paired',
    wsPort: 0,
    pinnedBindHost: '127.0.0.1',
    ...(mode === 'old-host'
      ? { methods: (await import('../../src/main/runtime/rpc/methods/status')).STATUS_METHODS }
      : {})
  })
  let pending: Promise<void> | undefined
  try {
    await server.start()
    if (mode === 'paired') {
      const offer = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'isolated-host-viewport',
        scope: 'runtime'
      })
      if (!offer.available) {
        throw new Error('Fixture pairing unavailable')
      }
      vi.stubEnv('ORCA_PAIRING_CODE', offer.pairingUrl)
      await rm(join(root, 'orca-runtime.json'))
    }
    const terminal = (await runtime.listTerminals()).terminals[0].handle,
      file = join(root, 'request.json')
    await writeFile(
      file,
      JSON.stringify({
        terminal,
        expectedPtyId: id,
        expectedIncarnationId: mode === 'stale' ? 'stale' : incarnationId,
        expectedExecutionHostId: mode === 'wrong-host' ? 'ssh:other' : host,
        expectedRendererId: 421,
        cols: 100,
        rows: 30,
        confirm: true
      })
    )
    pending = main(['terminal', 'claim-host-viewport', '--request-file', file, '--json'], root)
    if (queued) {
      await vi.waitFor(() => expect(claim).toHaveBeenCalledOnce())
      const { writeAfterHostViewportClaim } = await import('../../src/main/ipc/pty/ipc/write'),
        write = vi.fn(() => true),
        blockedWrite = writeAfterHostViewportClaim(id, write)
      expect(write).not.toHaveBeenCalled()
      if (mode === 'queued-navigation') {
        window.webContents.on.mock.calls.find((call) => call[0] === 'did-start-navigation')?.[1]()
      }
      if (mode === 'queued-replaced') {
        bind('replacement')
        ptyIncarnationById.set(id, 'replacement')
      }
      release?.()
      expect(await blockedWrite).toBe(mode === 'queued')
      expect(write).toHaveBeenCalledTimes(mode === 'queued' ? 1 : 0)
    }
    await pending
    const success = ['local', 'ssh', 'paired', 'already-host', 'queued'].includes(mode)
    expect(process.exitCode ?? 0, JSON.stringify(frames)).toBe(success ? 0 : 1)
    if (success) {
      expect(frames).toContainEqual(
        expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            canonicalClaimAccepted: true,
            hostResizeEligible: true,
            rendererApplied: false,
            viewportGeometryVerified: false
          })
        })
      )
    }
    if (['local', 'ssh', 'paired', 'queued'].includes(mode)) {
      expect(size).toEqual({ cols: 100, rows: 30 })
    }
    if (['queued-replaced', 'queued-navigation'].includes(mode)) {
      expect(size).toEqual({ cols: 40, rows: 12 })
    }
    if (mode === 'already-host') {
      expect(size).toEqual({ cols: 80, rows: 24 })
    }
    if (
      [
        'no-window',
        'wrong-renderer',
        'other-runtime',
        'destroyed',
        'stale',
        'wrong-host',
        'old-host'
      ].includes(mode)
    ) {
      expect(claim).not.toHaveBeenCalled()
    }
  } finally {
    release?.()
    await pending
    await server.stop()
    installPtyWriteIpcHandlers({})
    ptyOwnership.delete(id)
    ptyIncarnationById.delete(id)
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    process.exitCode = undefined
    await rm(root, { recursive: true, force: true })
  }
})
