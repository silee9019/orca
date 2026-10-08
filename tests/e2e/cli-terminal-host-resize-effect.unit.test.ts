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
import { ptySizes } from '../../src/main/ipc/pty/delivery/visibility-state'
const fixture = vi.hoisted(() => ({
  resize: vi.fn(),
  getAppliedSize: vi.fn(),
  available: true
}))
vi.mock('../../src/main/ipc/pty/provider/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof Registry>()),
  tryGetProviderForPty: () => (fixture.available ? fixture : undefined)
}))
it.each([
  'local',
  'ssh',
  'paired',
  'suppressed',
  'mobile',
  'remote',
  'wrong-host',
  'stale',
  'provider-failed',
  'unconfirmed',
  'mismatch',
  'no-confirm',
  'replacement',
  'no-provider',
  'old-host'
])('canonical host resize: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-host-resize-')),
    runtime = createRuntime(),
    id = mode === 'ssh' ? 'ssh:fixture@@resize' : 'resize-fixture',
    host = mode === 'ssh' ? 'ssh:fixture' : 'local',
    incarnationId = 'fixture-incarnation'
  runtime.setPtyController({
    write: () => true,
    kill: () => {},
    getForegroundProcess: async () => null,
    getSize: () => ({ cols: 80, rows: 24 })
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
  ptySizes.set(id, { cols: 80, rows: 24 })
  vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
  vi.spyOn(runtime, 'isResizeSuppressed').mockReturnValue(mode === 'suppressed')
  vi.spyOn(runtime, 'getDriver').mockReturnValue(
    mode === 'mobile' ? { kind: 'mobile', clientId: 'fixture' } : { kind: 'idle' }
  )
  vi.spyOn(runtime, 'isRemoteDesktopResizeDriven').mockReturnValue(mode === 'remote')
  const reclaim = vi.spyOn(runtime, 'recordRemoteDesktopHostReclaimTarget'),
    external = vi.spyOn(runtime, 'onExternalPtyResize')
  fixture.available = mode !== 'no-provider'
  fixture.resize.mockReset().mockImplementation(() => {
    if (mode === 'provider-failed') {
      throw new Error('private-provider-canary')
    }
    if (mode === 'replacement') {
      bind('replacement')
      ptyIncarnationById.set(id, 'replacement')
    }
  })
  fixture.getAppliedSize
    .mockReset()
    .mockResolvedValue(
      mode === 'unconfirmed'
        ? null
        : mode === 'mismatch'
          ? { cols: 79, rows: 23 }
          : { cols: 100, rows: 30 }
    )
  const frames: unknown[] = []
  vi.spyOn(console, 'log').mockImplementation((v) => {
    if (typeof v === 'string' && v.startsWith('{')) {
      frames.push(JSON.parse(v))
    }
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
    vi.stubEnv(key, undefined)
  }
  vi.stubEnv('ORCA_USER_DATA_PATH', root)
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
  try {
    await server.start()
    if (mode === 'paired') {
      const offer = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'isolated-host-resize',
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
        cols: 100,
        rows: 30,
        confirm: mode !== 'no-confirm'
      })
    )
    await main(['terminal', 'resize-host', '--request-file', file, '--json'], root)
    const success = ['local', 'ssh', 'paired'].includes(mode),
      called =
        success || ['provider-failed', 'unconfirmed', 'mismatch', 'replacement'].includes(mode)
    expect(process.exitCode ?? 0, JSON.stringify(frames)).toBe(success ? 0 : 1)
    expect(fixture.resize).toHaveBeenCalledTimes(called ? 1 : 0)
    if (success) {
      expect(fixture.resize).toHaveBeenCalledWith(id, 100, 30)
      expect(frames).toContainEqual(
        expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            providerApplied: true,
            rendererApplied: false,
            requested: { cols: 100, rows: 30 },
            applied: { cols: 100, rows: 30 }
          })
        })
      )
      expect(external).toHaveBeenCalledWith(id, 100, 30)
    }
    if (mode === 'remote') {
      expect(reclaim).toHaveBeenCalledWith(id, 100, 30)
    } else {
      expect(reclaim).not.toHaveBeenCalled()
    }
    expect(JSON.stringify(frames)).not.toContain('private-provider-canary')
    if (mode === 'replacement') {
      expect(external).not.toHaveBeenCalled()
    }
    if (!called || mode === 'replacement') {
      expect(ptySizes.get(id)).toEqual({ cols: 80, rows: 24 })
    }
  } finally {
    await server.stop()
    ptyOwnership.delete(id)
    ptyIncarnationById.delete(id)
    ptySizes.delete(id)
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    process.exitCode = undefined
    await rm(root, { recursive: true, force: true })
  }
})
