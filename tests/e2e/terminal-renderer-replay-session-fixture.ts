import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import type * as ManagedHookControlsModule from '../../src/main/agent-hooks/managed-agent-hook-controls'
import type * as PtyModule from '../../src/main/ipc/pty'
import type * as OutputIntakeModule from '../../src/main/ipc/ssh-pty-output-intake-registry'
import { vi } from 'vitest'
import { SshRelaySession } from '../../src/main/ssh/ssh-relay-session'
import {
  createMockDeps,
  mockDeploySuccess
} from '../../src/main/ssh/ssh-relay-session-test-fixtures'
import type { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
const replayFixture = vi.hoisted(() => ({
  replay: vi.fn<(callback: (payload: { id: string; data: string }) => void) => () => void>(
    () => () => {}
  ),
  request: vi.fn().mockResolvedValue([]),
  attach: vi.fn().mockResolvedValue({}),
  provider: vi.fn(),
  ids: vi.fn().mockReturnValue([]),
  generation: vi.fn().mockReturnValue(23)
}))
vi.mock('../../src/main/ssh/ssh-relay-deploy', () => ({ deployAndLaunchRelay: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-pty-consumer-session', () => ({
  openSshPtyConsumerSession: vi.fn(async (_mux, options) => ({
    state: {
      mode: 'negotiated',
      clientInstanceId: options.clientInstanceId,
      clientGeneration: 1,
      ownerGeneration: 1,
      ownerLease: 'fixture-owner'
    },
    resumed: false
  }))
}))
vi.mock('../../src/main/ssh/ssh-channel-multiplexer', () => ({
  SshChannelMultiplexer: class {
    notify = vi.fn()
    request = replayFixture.request
    onNotification = vi.fn().mockReturnValue(() => {})
    onNotificationByMethod = vi.fn().mockReturnValue(() => {})
    onRequest = vi.fn().mockReturnValue(() => {})
    onDispose = vi.fn().mockReturnValue(() => {})
    dispose = vi.fn()
    isDisposed = () => false
  }
}))
vi.mock('../../src/main/agent-hooks/remote-managed-hook-installers', () => ({
  installRemoteManagedAgentHooks: vi.fn().mockResolvedValue([])
}))
vi.mock('../../src/main/providers/ssh-pty-provider', () => ({
  isSshPtyNotFoundError: () => false,
  isSshPtyIdentityMismatchError: () => false,
  SshPtyProvider: class {
    onData = vi.fn().mockReturnValue(() => {})
    onReplay = replayFixture.replay
    onExit = vi.fn().mockReturnValue(() => {})
    attach = vi.fn().mockResolvedValue(undefined)
    attachForReconnect = replayFixture.attach
    setPtyDeliveryPauseAdapter = vi.fn()
    dispose = vi.fn()
  }
}))
vi.mock('../../src/main/providers/ssh-filesystem-provider', () => ({
  SshFilesystemProvider: class {
    dispose = vi.fn()
  }
}))
vi.mock('../../src/main/providers/ssh-git-provider', () => ({ SshGitProvider: class {} }))
vi.mock('../../src/main/ipc/pty', async () => ({
  ...(await vi.importActual<typeof PtyModule>('../../src/main/ipc/pty')),
  registerSshPtyProvider: vi.fn((_id, provider) => {
    replayFixture.provider.mockReturnValue(provider)
  }),
  unregisterSshPtyProvider: vi.fn(),
  getSshPtyProvider: replayFixture.provider,
  getPtyIdsForConnection: replayFixture.ids,
  clearPtyOwnershipForConnection: vi.fn(),
  clearProviderPtyState: vi.fn(),
  deletePtyOwnership: vi.fn(),
  restorePtyIncarnation: vi.fn(),
  setPtyOwnership: vi.fn()
}))
vi.mock('../../src/main/providers/ssh-filesystem-dispatch', () => ({
  registerSshFilesystemProvider: vi.fn(),
  unregisterSshFilesystemProvider: vi.fn(),
  getSshFilesystemProvider: vi.fn().mockReturnValue({ dispose: vi.fn() })
}))
vi.mock('../../src/main/providers/ssh-git-dispatch', () => ({
  registerSshGitProvider: vi.fn(),
  unregisterSshGitProvider: vi.fn()
}))
vi.mock('../../src/main/ipc/ssh-pty-output-intake-registry', async () => ({
  ...(await vi.importActual<typeof OutputIntakeModule>(
    '../../src/main/ipc/ssh-pty-output-intake-registry'
  )),
  allocateSshPtyProviderGeneration: replayFixture.generation,
  beginSshPtyOutputGenerationMigration: vi.fn(() => ({
    byPty: new Map(),
    completion: Promise.resolve()
  })),
  closeSshPtyOutputGeneration: vi.fn(),
  getSshPtyAcceptedSourceCheckpoints: vi.fn(() => [])
}))
export async function createReplaySessionFixture(
  runtime: OrcaRuntimeService,
  targetId: string,
  rendererId: number
) {
  const hookControls = await vi.importMock<typeof ManagedHookControlsModule>(
    '../../src/main/agent-hooks/managed-agent-hook-controls'
  )
  Object.defineProperty(hookControls, 'isAgentStatusHooksEnabled', {
    value: () => false,
    configurable: true
  })
  const deps = createMockDeps()
  Object.defineProperty(deps.mockWindow.webContents, 'id', {
    value: rendererId,
    configurable: true
  })
  vi.spyOn(deps.mockWindow, 'isVisible').mockReturnValue(false)
  mockDeploySuccess()
  const session = new SshRelaySession(
    targetId,
    deps.getMainWindow,
    deps.mockStore,
    deps.mockPortForward,
    runtime
  )
  try {
    await session.establish(deps.mockConn)
    const providerReplay = replayFixture.replay.mock.calls.at(-1)?.[0]
    if (session.getState() !== 'ready' || !providerReplay) {
      throw new Error('Fixture replay session is not ready')
    }
    return { session, deps, providerReplay }
  } catch (error) {
    session.dispose()
    throw error
  }
}

export function getReplayFixture() {
  return replayFixture
}
