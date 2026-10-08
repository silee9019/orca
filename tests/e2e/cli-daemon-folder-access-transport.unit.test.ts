import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { createRuntime } from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import { STATUS_METHODS } from '../../src/main/runtime/rpc/methods/status'
import { DAEMON_FOLDER_ACCESS_METHODS } from '../../src/main/runtime/rpc/methods/daemon-folder-access'
import { PROTOCOL_VERSION } from '../../src/main/daemon/types'
import { DaemonFolderAccessStatusParams } from '../../src/shared/rpc-contract/daemon-folder-access-params'
const state = vi.hoisted(() => ({ reset: vi.fn(), probe: vi.fn(), access: 'unknown' }))
vi.mock('../../src/main/daemon/daemon-init', () => ({
  getDaemonProvider: () => ({ marker: 'fixture' })
}))
vi.mock('../../src/main/daemon/daemon-provider-routing', () => ({
  getCurrentDaemonAdapter: () => ({
    protocolVersion: PROTOCOL_VERSION,
    getDaemonIdentity: () => ({ pid: 987654321, startedAtMs: 1, launchNonce: 'private-nonce' })
  })
}))
vi.mock('../../src/main/daemon/daemon-provider-restart', () => ({ restartDaemon: vi.fn() }))
vi.mock('../../src/main/daemon/daemon-restart-state', () => ({
  isDaemonRestartInFlight: () => false
}))
vi.mock('../../src/main/daemon/daemon-folder-access-reset', () => ({
  resetFolderAccessForDaemon: state.reset
}))
vi.mock('../../src/main/daemon/daemon-folder-access-mismatch', () => ({
  getDaemonFolderAccessTarget: () => ({
    canonicalPath: '/private-folder-fixture',
    cwdClass: 'documents'
  }),
  getDaemonFolderAccessMismatch: () => ({
    daemonScope: 'fixture',
    cwdClass: 'documents',
    freshDaemonAccess: state.access
  }),
  refreshDaemonFolderAccessProbe: state.probe
}))
it.each(['local', 'paired', 'old-local', 'old-paired'])(
  'uses the selected authenticated host for the human workflow: %s',
  async (mode) => {
    const platform = process.platform
    Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' })
    const root = await mkdtemp(join(tmpdir(), 'orca-folder-workflow-transport-')),
      runtime = createRuntime()
    vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
    const paired = mode.includes('paired'),
      old = mode.startsWith('old')
    const server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath: root,
      enableWebSocket: paired,
      wsPort: 0,
      pinnedBindHost: '127.0.0.1',
      methods: [...STATUS_METHODS, ...(old ? [] : DAEMON_FOLDER_ACCESS_METHODS)]
    })
    state.reset.mockReset().mockImplementation(async (_identity, options) => {
      options.assertOwner()
      return { outcome: 'probed', mismatch: null }
    })
    state.probe.mockReset().mockResolvedValue(undefined)
    state.access = 'unknown'
    for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
      vi.stubEnv(key, undefined)
    }
    vi.stubEnv('ORCA_USER_DATA_PATH', root)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const latest = () => JSON.parse(String(output.mock.calls.at(-1)?.[0]))
    try {
      await server.start()
      if (paired) {
        const offer = server.createPairingOffer({
          address: '127.0.0.1',
          name: 'isolated-folder-workflow',
          scope: 'runtime'
        })
        if (!offer.available) {
          throw new Error('Fixture pairing unavailable')
        }
        vi.stubEnv('ORCA_PAIRING_CODE', offer.pairingUrl)
        await rm(join(root, 'orca-runtime.json'))
      }
      await main(['terminal', 'daemon', 'folder-access-plan', '--json'], root)
      if (old) {
        expect(process.exitCode).toBe(1)
        expect(latest().error.code).toBe('method_not_found')
        expect(state.reset).not.toHaveBeenCalled()
        return
      }
      const pin = DaemonFolderAccessStatusParams.omit({ operationId: true })
          .strip()
          .parse(latest().result),
        target = { ...pin, operationId: randomUUID() }
      const file = join(root, 'request.json')
      await writeFile(file, JSON.stringify({ ...target, confirm: true, allowOsPrompt: true }))
      await main(
        ['terminal', 'daemon', 'folder-access-start', '--request-file', file, '--json'],
        root
      )
      expect(process.exitCode).toBeUndefined()
      expect(state.reset).toHaveBeenCalledOnce()
      await writeFile(file, JSON.stringify(target))
      await main(
        ['terminal', 'daemon', 'folder-access-status', '--request-file', file, '--json'],
        root
      )
      expect(latest().result.permissionConfirmed).toBe(false)
      expect(state.probe).not.toHaveBeenCalled()
      state.access = 'allowed'
      await writeFile(file, JSON.stringify({ ...target, confirm: true, humanResponded: true }))
      await main(
        ['terminal', 'daemon', 'folder-access-complete', '--request-file', file, '--json'],
        root
      )
      expect(process.exitCode).toBeUndefined()
      expect(latest().result.permissionConfirmed).toBe(true)
      expect(state.probe).toHaveBeenCalledOnce()
      expect(JSON.stringify(output.mock.calls)).not.toMatch(/private-nonce|private-folder-fixture/)
    } finally {
      await server.stop()
      Object.defineProperty(process, 'platform', { configurable: true, value: platform })
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      process.exitCode = undefined
      await rm(root, { recursive: true, force: true })
    }
  }
)
