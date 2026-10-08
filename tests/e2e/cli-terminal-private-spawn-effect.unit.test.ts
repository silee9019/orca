import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import {
  store,
  TEST_WORKTREE_ID,
  makeFolderWorkspace,
  TEST_FOLDER_WORKSPACE_KEY
} from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import type { TerminalWorkspaceLaunchScope } from '../../src/main/runtime/runtime-legacy-worker-terminal-recovery-types'
import type { RuntimePtyController } from '../../src/main/runtime/runtime-pty-controller-contract'
class SpawnFixtureRuntime extends OrcaRuntimeService {
  beforeEnvReturn?: () => void
  constructor(readonly scope: TerminalWorkspaceLaunchScope) {
    super(store)
  }
  protected override async buildTerminalWorkspaceEnv(
    scope: TerminalWorkspaceLaunchScope,
    baseEnv: Record<string, string>,
    paneKey: string,
    tabId: string,
    agentTeamsEnv?: Record<string, string>
  ): Promise<Record<string, string>> {
    const env = await super.buildTerminalWorkspaceEnv(scope, baseEnv, paneKey, tabId, agentTeamsEnv)
    this.beforeEnvReturn?.()
    return env
  }
  protected override async resolveTerminalWorkspaceLaunchScope(): Promise<TerminalWorkspaceLaunchScope> {
    return this.scope
  }
}
it.each([
  'local',
  'paired',
  'folder',
  'wrong-runtime',
  'wrong-host',
  'old-host',
  'provider-failed',
  'repeat',
  'fresh-refused',
  'reattach',
  'ssh',
  'replaced-before-spawn'
])('spawns through canonical hidden runtime creation: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-private-spawn-')),
    folder = mode === 'folder',
    worktreeId = folder ? TEST_FOLDER_WORKSPACE_KEY : TEST_WORKTREE_ID
  const runtime = new SpawnFixtureRuntime({
    id: worktreeId,
    path: root,
    connectionId: mode === 'ssh' ? 'fixture' : null,
    repo: null,
    folderWorkspace: folder ? makeFolderWorkspace({ folderPath: root }) : null
  })
  const ptyId = mode === 'ssh' ? 'ssh:fixture@@private-spawn-fixture' : 'private-spawn-fixture'
  if (mode === 'replaced-before-spawn') {
    runtime.beforeEnvReturn = () => {
      vi.spyOn(runtime, 'getRuntimeId').mockReturnValue('replacement-runtime')
    }
  }
  const spawn = vi
    .fn<NonNullable<RuntimePtyController['spawn']>>()
    .mockResolvedValue({ id: ptyId, incarnationId: 'spawn-fixture-incarnation' })
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  if (mode === 'repeat') {
    spawn.mockImplementation(async () => {
      await gate
      return { id: ptyId, incarnationId: 'spawn-fixture-incarnation' }
    })
  }
  const dedupe = vi.spyOn(runtime, 'dedupeTerminalCreate')
  if (mode === 'fresh-refused' || mode === 'reattach') {
    spawn.mockImplementation(async (opts) => ({
      id: ptyId,
      incarnationId: 'spawn-fixture-incarnation',
      stablePaneOwner: {
        handle: opts.preAllocatedHandle ?? 'term-fixture',
        tabId: 'spawn-tab',
        leafId: '22222222-2222-4222-8222-222222222222'
      }
    }))
  }
  if (mode === 'provider-failed') {
    spawn.mockRejectedValue(new Error('fixture spawn refused'))
  }
  runtime.setPtyController({
    spawn,
    write: () => true,
    kill: () => true,
    getForegroundProcess: async () => null
  })
  vi.stubEnv('ORCA_USER_DATA_PATH', root)
  for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
    vi.stubEnv(key, undefined)
  }
  const frames: unknown[] = []
  vi.spyOn(console, 'log').mockImplementation((value) => {
    if (typeof value === 'string' && value.startsWith('{')) {
      frames.push(JSON.parse(value))
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
  try {
    await server.start()
    if (mode === 'paired') {
      const offer = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'isolated-private-spawn',
        scope: 'runtime'
      })
      if (!offer.available) {
        throw new Error('Fixture pairing unavailable')
      }
      vi.stubEnv('ORCA_PAIRING_CODE', offer.pairingUrl)
      await rm(join(root, 'orca-runtime.json'))
    }
    const file = join(root, 'request.json')
    await writeFile(
      file,
      JSON.stringify({
        expectedRuntimeId: mode === 'wrong-runtime' ? 'wrong-runtime' : runtime.getRuntimeId(),
        expectedExecutionHostId: mode === 'wrong-host' || mode === 'ssh' ? 'ssh:fixture' : 'local',
        worktreeId,
        clientMutationId: '11111111-1111-4111-8111-111111111111',
        cols: 97,
        rows: 29,
        confirm: true,
        ...(mode === 'reattach' ? { requireFreshPane: false } : {}),
        command: 'private spawn command 한글',
        env: { PRIVATE_SPAWN_CANARY: 'private env 한글' },
        tabId: 'spawn-tab',
        leafId: '22222222-2222-4222-8222-222222222222'
      })
    )
    const run = () => main(['terminal', 'spawn', '--request-file', file, '--json'])
    if (mode === 'repeat') {
      const first = run()
      await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
      const second = run()
      await vi.waitFor(() => expect(dedupe).toHaveBeenCalledTimes(2))
      release?.()
      await Promise.all([first, second])
    } else {
      await run()
    }
    const success = ['local', 'paired', 'folder', 'repeat', 'reattach', 'ssh'].includes(mode)
    expect(process.exitCode ?? 0, JSON.stringify(frames)).toBe(success ? 0 : 1)
    if (success) {
      expect(spawn).toHaveBeenCalledWith(
        expect.objectContaining({
          cols: 97,
          rows: 29,
          cwd: root,
          command: 'private spawn command 한글',
          commandDelivery: 'provider',
          initiallyHidden: true,
          persistHostSessionBinding: true,
          env: expect.objectContaining({ PRIVATE_SPAWN_CANARY: 'private env 한글' })
        })
      )
      expect(frames).toContainEqual(
        expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            terminal: expect.objectContaining({
              ptyId,
              worktreeId,
              executionHostId: mode === 'ssh' ? 'ssh:fixture' : 'local',
              surface: 'background'
            }),
            rendererApplied: false,
            providerGeometryVerified: false
          })
        })
      )
      if (mode === 'repeat') {
        expect(spawn).toHaveBeenCalledTimes(1)
      }
    }
    if (['wrong-runtime', 'wrong-host', 'old-host', 'replaced-before-spawn'].includes(mode)) {
      expect(spawn).not.toHaveBeenCalled()
    }
    expect(JSON.stringify(frames)).not.toContain('private spawn command')
    expect(JSON.stringify(frames)).not.toContain('private env')
  } finally {
    release?.()
    await server.stop()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    process.exitCode = undefined
    await rm(root, { recursive: true, force: true })
  }
})
