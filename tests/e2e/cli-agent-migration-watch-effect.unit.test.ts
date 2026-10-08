import { getMigrationUnsupportedPtyObserverCount } from '../../src/main/agent-hooks/migration-unsupported-pty-observers'
import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import {
  setMigrationUnsupportedPty,
  clearMigrationUnsupportedPty,
  clearMigrationUnsupportedPtysForPaneKey,
  clearMigrationUnsupportedPtysByTabPrefix,
  setMigrationUnsupportedPtyListener,
  setMigrationUnsupportedPtyPersistenceListener,
  getMigrationUnsupportedPtySnapshot
} from '../../src/main/agent-hooks/migration-unsupported-pty-state'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import { main } from '../../src/cli/index'
import { STATUS_METHODS } from '../../src/main/runtime/rpc/methods/status'
import { readMetadata } from '../../src/cli/runtime/metadata'
import { getActiveRuntimeJsonEventStreamCount } from '../../src/main/runtime/runtime-json-event-subscription'

it.each([
  'local',
  'paired',
  'old-local',
  'old-paired',
  'invalid-request',
  'duplicates',
  'pane-batch',
  'tab-batch',
  'cancelled'
])(
  'observes canonical migration unsupported set and clear changes with host and lifetime boundaries: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-migration-watch-'))
    const ptyId = `fixture-${mode}`
    const otherPty = `other-${mode}`
    const paneKey = `migration-${mode}:11111111-1111-4111-8111-111111111111`
    const ui = vi.fn(),
      persisted = vi.fn()
    setMigrationUnsupportedPtyListener(ui)
    setMigrationUnsupportedPtyPersistenceListener(persisted)
    const seed = (ptyId: string) =>
      setMigrationUnsupportedPty({
        ptyId,
        paneKey,
        tabId: `migration-${mode}`,
        worktreeId: 'folder:fixture',
        reason: 'legacy-numeric-pane-key',
        source: 'ssh',
        updatedAt: 1
      })
    seed(ptyId)
    const runtime = new OrcaRuntimeService(null)
    vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
    const paired = mode === 'paired' || mode === 'old-paired'
    const server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath: root,
      enableWebSocket: paired,
      wsPort: 0,
      pinnedBindHost: '127.0.0.1',
      ...(mode === 'old-paired' ? { methods: STATUS_METHODS } : {})
    })
    vi.stubEnv('ORCA_USER_DATA_PATH', root)
    for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
      vi.stubEnv(key, undefined)
    }
    const frames: unknown[] = []
    vi.spyOn(console, 'log').mockImplementation((value: unknown) =>
      frames.push(JSON.parse(String(value)))
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let interrupt: (() => void) | undefined
    if (mode === 'cancelled') {
      const original = process.on
      vi.spyOn(process, 'on').mockImplementation((event, listener) => {
        if (event === 'SIGINT') {
          interrupt = () => listener()
          return process
        }
        return original.call(process, event, listener)
      })
    }
    let pending: Promise<void> | undefined
    try {
      await server.start()
      const secret = readMetadata(root).authToken
      let pairingSecret: string | undefined
      if (paired) {
        const offer = server.createPairingOffer({
          address: '127.0.0.1',
          name: 'fixture-migration-watch',
          scope: 'runtime'
        })
        if (!offer.available) {
          throw new Error('Fixture pairing unavailable')
        }
        pairingSecret = offer.pairingUrl
        vi.stubEnv('ORCA_PAIRING_CODE', pairingSecret)
        await rm(join(root, 'orca-runtime.json'))
      } else if (mode === 'old-local') {
        await writeFile(
          join(root, 'orca-runtime.json'),
          JSON.stringify({ ...readMetadata(root), agentStatusMigrationStreaming: undefined })
        )
      }
      const file = join(root, 'watch.json')
      await writeFile(
        file,
        JSON.stringify(
          mode === 'invalid-request'
            ? { watchMs: 0, unknown: true }
            : {
                watchMs: 1000,
                ptyIds: mode === 'duplicates' ? [ptyId, ptyId] : [ptyId]
              }
        )
      )
      pending = main(['agent', 'status', 'watch-migration', '--request-file', file, '--json'], root)
      if (['old-local', 'old-paired', 'invalid-request', 'duplicates'].includes(mode)) {
        await pending
        expect(process.exitCode).toBe(1)
        expect(frames).toContainEqual(
          expect.objectContaining({
            ok: false,
            error: expect.objectContaining({
              code:
                mode === 'old-local'
                  ? 'method_not_supported'
                  : mode === 'old-paired'
                    ? 'method_not_found'
                    : mode === 'invalid-request'
                      ? 'invalid_argument'
                      : 'invalid_argument'
            })
          })
        )
        expect(getActiveRuntimeJsonEventStreamCount(runtime, 'agentStatusMigration')).toBe(0)
        return
      }
      await vi.waitFor(() =>
        expect(frames).toContainEqual(expect.objectContaining({ type: 'ready' }))
      )
      if (mode === 'cancelled') {
        if (!interrupt) {
          throw new Error('Fixture interrupt unavailable')
        }
        interrupt()
      } else {
        seed(otherPty)
        seed(ptyId)
        if (mode === 'pane-batch') {
          clearMigrationUnsupportedPtysForPaneKey(paneKey)
        } else if (mode === 'tab-batch') {
          clearMigrationUnsupportedPtysByTabPrefix(`migration-${mode}`)
        } else {
          clearMigrationUnsupportedPty(ptyId)
        }
      }
      await pending
      expect(process.exitCode ?? 0).toBe(mode === 'cancelled' ? 130 : 0)
      if (mode !== 'cancelled') {
        const changes = frames.filter(
          (frame) =>
            typeof frame === 'object' && frame !== null && 'type' in frame && frame.type === 'event'
        )
        expect(changes).toHaveLength(2)
        expect(changes[0]).toMatchObject({
          sequence: 1,
          change: {
            type: 'set',
            entry: { ptyId, source: 'ssh', reason: 'legacy-numeric-pane-key' }
          }
        })
        expect(changes[1]).toMatchObject({ sequence: 2, change: { type: 'clear', ptyId } })
        expect(ui).toHaveBeenCalledWith(expect.objectContaining({ type: 'clear', ptyId }))
        expect(persisted).toHaveBeenCalled()
      }
      expect(JSON.stringify(frames)).not.toContain(otherPty)
      expect(JSON.stringify(frames)).not.toContain(secret)
      if (pairingSecret) {
        expect(JSON.stringify(frames)).not.toContain(pairingSecret)
      }
      await vi.waitFor(() => expect(getMigrationUnsupportedPtyObserverCount()).toBe(0))
      expect(getActiveRuntimeJsonEventStreamCount(runtime, 'agentStatusMigration')).toBe(0)
    } finally {
      await pending
      await server.stop()
      setMigrationUnsupportedPtyListener(null)
      setMigrationUnsupportedPtyPersistenceListener(null)
      for (const entry of getMigrationUnsupportedPtySnapshot()) {
        clearMigrationUnsupportedPty(entry.ptyId)
      }
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      process.exitCode = undefined
      await rm(root, { recursive: true, force: true })
    }
  }
)
