import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
const synthetic = vi.hoisted(() => ({ runtime: vi.fn(), window: vi.fn(), settings: vi.fn() }))
vi.mock('../../src/main/startup/main-process-state', () => ({
  mainProcessState: {
    get runtime() {
      return synthetic.runtime()
    },
    get mainWindow() {
      return synthetic.window()
    },
    get store() {
      return { getSettings: synthetic.settings }
    }
  }
}))
import { main } from '../../src/cli/index'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import {
  createRuntime,
  syncSinglePty,
  TEST_WORKTREE_ID
} from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import * as paneOwners from '../../src/main/ipc/pty'
import {
  driveSyntheticTitleFromHook,
  stopAllSyntheticTitleSpinners
} from '../../src/main/startup/synthetic-title-runtime'
import { getSyntheticAgentTitleProfile } from '../../src/shared/synthetic-agent-title'
it.each(['copy', 'default', 'main-authority', 'no-window', 'other-renderer', 'send-failed'])(
  'observes only synthetic title frames actually copied to renderer data: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-synthetic-data-')),
      runtime = createRuntime(),
      id = 'fixture-synthetic',
      incarnationId = 'fixture-incarnation',
      window = {
        isDestroyed: () => false,
        isVisible: () => false,
        isMinimized: () => false,
        webContents: { id: mode === 'other-renderer' ? 422 : 421, send: vi.fn() }
      }
    runtime.setPtyController({
      write: () => true,
      kill: () => {},
      getForegroundProcess: async () => null,
      resize: () => true,
      getSize: () => ({ cols: 80, rows: 24 })
    })
    syncSinglePty(runtime, id)
    runtime.registerPty(id, TEST_WORKTREE_ID, null, {
      tabId: 'tab-1',
      leafId: 'pane:1',
      incarnationId
    })
    vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
    const ingest = vi.spyOn(runtime, 'ingestSyntheticTitleFrame').mockImplementation(() => {})
    vi.spyOn(paneOwners, 'getPtyIdForPaneKey').mockReturnValue(id)
    synthetic.runtime.mockReturnValue(runtime)
    synthetic.window.mockReturnValue(mode === 'no-window' ? null : window)
    synthetic.settings.mockReturnValue(
      mode === 'default' ? {} : { terminalMainSideEffectAuthority: mode === 'main-authority' }
    )
    const server = new OrcaRuntimeRpcServer({ runtime, userDataPath: root }),
      frames: unknown[] = []
    for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
      vi.stubEnv(key, undefined)
    }
    vi.stubEnv('ORCA_USER_DATA_PATH', root)
    vi.spyOn(console, 'log').mockImplementation((v) => {
      frames.push(JSON.parse(String(v)))
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let pending: Promise<void> | undefined
    try {
      await server.start()
      const terminal = (await runtime.listTerminals()).terminals[0].handle,
        file = join(root, 'request.json')
      await writeFile(
        file,
        JSON.stringify({
          terminal,
          expectedPtyId: id,
          expectedIncarnationId: incarnationId,
          expectedExecutionHostId: 'local',
          expectedRendererId: 421,
          includeContent: true,
          watchMs: 400
        })
      )
      pending = main(['terminal', 'watch-renderer-data', '--request-file', file, '--json'], root)
      await vi.waitFor(() =>
        expect(frames).toContainEqual(expect.objectContaining({ type: 'ready' }))
      )
      const profile = getSyntheticAgentTitleProfile('cursor')
      if (!profile) {
        throw new Error('Fixture synthetic profile unavailable')
      }
      if (mode === 'send-failed') {
        window.webContents.send.mockImplementation(() => {
          throw new Error('Isolated synthetic renderer disposed')
        })
        expect(() => driveSyntheticTitleFromHook('tab-1:pane:1', 'blocked', profile)).toThrow(
          'Isolated synthetic renderer disposed'
        )
      } else {
        driveSyntheticTitleFromHook('tab-1:pane:1', 'blocked', profile)
      }
      await pending
      const events = frames.filter(
        (f) => typeof f === 'object' && f !== null && 'type' in f && f.type === 'event'
      )
      expect(events).toHaveLength(mode === 'copy' ? 1 : 0)
      const data = `\x1b]0;${profile.permissionLabel}\x07\x07`
      if (mode === 'copy') {
        expect(events).toEqual([
          expect.objectContaining({
            request: {
              kind: 'renderer-data',
              ptyId: id,
              rendererId: 421,
              origin: 'synthetic-title',
              payload: { id, data }
            },
            rendererApplied: false
          })
        ])
      }
      expect(window.webContents.send).toHaveBeenCalledTimes(
        ['copy', 'other-renderer', 'send-failed'].includes(mode) ? 1 : 0
      )
      expect(ingest).toHaveBeenCalledTimes(mode === 'no-window' ? 0 : 1)
      expect(process.exitCode ?? 0).toBe(0)
    } finally {
      await pending
      await server.stop()
      stopAllSyntheticTitleSpinners()
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      synthetic.runtime.mockReset()
      synthetic.window.mockReset()
      synthetic.settings.mockReset()
      process.exitCode = undefined
      await rm(root, { recursive: true, force: true })
    }
  }
)
