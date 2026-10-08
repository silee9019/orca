import { getLegacyWorkerRecoveryObserverCount } from '../../src/main/runtime/legacy-worker-recovery-observers'
import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import '../../src/main/runtime/orca-runtime-test-lifecycle.spec'
import {
  makePostRevealWorkerRecoveryHarness,
  publishLegacyWorkerReveal
} from '../../src/main/runtime/orca-runtime-test-scenario-builders.spec'
import {
  TEST_WORKTREE_ID,
  TEST_WORKTREE_PATH,
  HEADLESS_LEAF_ID
} from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
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
  'headless',
  'exited',
  'rolled-back',
  'unverifiable',
  'cancelled'
])(
  'observes canonical legacy worker recovery changes with host and lifetime boundaries: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-worker-recovery-watch-'))
    const processRecord = {
      id: 'pty-post-reveal',
      incarnationId: '45454545-4545-4545-8545-454545454545',
      terminalHandle: 'term_post_reveal',
      title: 'fixture',
      cwd: TEST_WORKTREE_PATH,
      worktreeId: TEST_WORKTREE_ID,
      wslDistro: null
    }
    const listProcesses = vi
      .fn()
      .mockResolvedValueOnce([processRecord])
      .mockResolvedValueOnce([processRecord])
      .mockImplementationOnce(async () => {
        if (mode === 'exited') {
          return []
        }
        if (mode === 'rolled-back') {
          return [
            {
              ...processRecord,
              incarnationId: '67676767-6767-4767-8767-676767676767',
              terminalHandle: 'term_replacement'
            }
          ]
        }
        throw new Error('Fixture inventory unavailable')
      })
    const harness = makePostRevealWorkerRecoveryHarness(
      () => mode !== 'exited' && mode !== 'rolled-back',
      ['exited', 'rolled-back', 'unverifiable'].includes(mode) ? listProcesses : undefined
    )
    const { runtime } = harness
    runtime.getOrchestrationDb().listWorkerTerminalReleaseBacklog = () => []
    if (mode === 'headless') {
      runtime.setNotifier(null)
    } else {
      harness.revealTerminalSession.mockImplementation(() =>
        publishLegacyWorkerReveal(runtime, {
          worktreeId: TEST_WORKTREE_ID,
          tabId: 'legacy-post-reveal',
          leafId: HEADLESS_LEAF_ID,
          ptyId: harness.ptyId
        })
      )
    }
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
          name: 'fixture-worker-recovery-watch',
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
          JSON.stringify({ ...readMetadata(root), agentWorkerRecoveryStreaming: undefined })
        )
      }
      const file = join(root, 'watch.json')
      await writeFile(
        file,
        JSON.stringify(
          mode === 'invalid-request'
            ? { watchMs: 0, unknown: true }
            : { watchMs: 400, paneKeys: [harness.workerPaneKey] }
        )
      )
      pending = main(['agent', 'status', 'watch-recovery', '--request-file', file, '--json'], root)
      if (['old-local', 'old-paired', 'invalid-request'].includes(mode)) {
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
        expect(getActiveRuntimeJsonEventStreamCount(runtime, 'agentWorkerRecovery')).toBe(0)
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
        await runtime.reconcileLegacyWorkerTerminals({ materializeRenderer: mode !== 'headless' })
      }
      await pending
      expect(process.exitCode ?? 0).toBe(mode === 'cancelled' ? 130 : 0)
      if (mode !== 'cancelled' && mode !== 'unverifiable') {
        expect(frames).toContainEqual(
          expect.objectContaining({
            type: 'event',
            sequence: 1,
            recovery: expect.objectContaining({
              paneKey: harness.workerPaneKey,
              resolution:
                mode === 'exited'
                  ? 'rolled_back'
                  : mode === 'rolled-back'
                    ? 'rolled_back'
                    : 'adopted'
            })
          })
        )
        if (mode === 'exited') {
          expect(frames).toContainEqual(
            expect.objectContaining({ recovery: expect.objectContaining({ resolution: 'exited' }) })
          )
        }
      }
      if (mode === 'unverifiable') {
        expect(frames).not.toContainEqual(expect.objectContaining({ type: 'event' }))
        expect(
          harness.getSession().sleepingAgentSessionsByPaneKey?.[harness.workerPaneKey]
        ).toBeDefined()
      }
      expect(harness.kill).not.toHaveBeenCalled()
      if (mode === 'headless') {
        expect(harness.revealTerminalSession).not.toHaveBeenCalled()
      }
      expect(JSON.stringify(frames)).not.toContain(secret)
      if (pairingSecret) {
        expect(JSON.stringify(frames)).not.toContain(pairingSecret)
      }
      await vi.waitFor(() => expect(getLegacyWorkerRecoveryObserverCount(runtime)).toBe(0))
      expect(getActiveRuntimeJsonEventStreamCount(runtime, 'agentWorkerRecovery')).toBe(0)
    } finally {
      await pending
      await server.stop()

      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      process.exitCode = undefined
      await rm(root, { recursive: true, force: true })
    }
  }
)
