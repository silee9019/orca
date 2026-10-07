import { afterEach, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type { RuntimeSettingsActions } from '../runtime/runtime-settings-actions'
import { createGlobalSettingsFixture } from '../../shared/global-settings-test-fixture'
import {
  applyAccountSecretSetting,
  setAccountSecretSettingsWriter
} from '../runtime/account-secret-settings-writer'
import {
  manageAccountPreference,
  setAccountPreferenceAccess
} from '../runtime/account-preference-access'
import {
  manageAgentPermissionMode,
  setAgentPermissionModeAccess
} from '../runtime/agent-permission-mode-access'

const fixture = vi.hoisted(() => {
  const actions: { current?: RuntimeSettingsActions } = {}
  return {
    getSettings: vi.fn<() => GlobalSettings>(),
    flush: vi.fn(async () => {}),
    apply: vi.fn(),
    available: vi.fn(async () => true),
    distros: vi.fn(async () => ['Ubuntu']),
    actions
  }
})
vi.mock('./main-process-state', () => ({
  mainProcessState: {
    store: { getSettings: fixture.getSettings, flushPendingOrThrowAsync: fixture.flush },
    stats: {}
  }
}))
vi.mock('electron', () => ({ app: { once: vi.fn() } }))
vi.mock('../ipc/desktop-settings-update', () => ({ applyDesktopSettingsUpdate: fixture.apply }))
vi.mock('../wsl', () => ({
  isWslAvailableAsync: fixture.available,
  listWslDistrosAsync: fixture.distros
}))
vi.mock('../runtime/orca-runtime', () => ({
  OrcaRuntimeService: class {
    constructor(
      _store: unknown,
      _stats: unknown,
      options: { settingsActions: RuntimeSettingsActions }
    ) {
      fixture.actions.current = options.settingsActions
    }
    rehydrateClientHostedBrowserPages() {}
  }
}))
vi.mock('../agent-hooks/server', () => ({ agentHookServer: { subscribeEnrichedStatus: vi.fn() } }))
vi.mock('../browser/browser-manager', () => ({
  browserManager: { setBrowserGuestStateChangedListener: vi.fn() }
}))
vi.mock('../ghostty/index', () => ({ previewGhosttyImport: vi.fn() }))
vi.mock('../warp-themes', () => ({ previewWarpThemeImport: vi.fn() }))
vi.mock('../ai-vault-search/session-search-enablement', () => ({
  applySessionSearchSettingsChange: vi.fn(),
  installChildSessionSearchService: vi.fn()
}))
vi.mock('../../shared/execution-host', () => ({ LOCAL_EXECUTION_HOST_ID: vi.fn() }))
vi.mock('../ai-vault-search/session-search-store-scope-catalog', () => ({
  sessionSearchScopeCatalogFromStore: vi.fn()
}))
vi.mock('../persistence/loading-store/user-data-path', () => ({
  getCanonicalUserDataPath: vi.fn()
}))
vi.mock('../ipc/pty', () => ({
  getLocalPtyProvider: vi.fn(),
  getSshPtyProvider: vi.fn(),
  clearProviderPtyState: vi.fn()
}))
vi.mock('../runtime/agent-session-claim-identity', () => ({ loadAgentSessionClaimSigner: vi.fn() }))
vi.mock('../orca-profiles/profile-storage-paths', () => ({ getProfileUserDataPath: vi.fn() }))
vi.mock('../codex/codex-ai-vault-session-resume', () => ({
  prepareCodexAiVaultSessionResume: vi.fn()
}))
vi.mock('../codex/codex-session-source-home', () => ({
  resolveHostCodexSessionSourceHome: vi.fn()
}))
vi.mock('../agent-hooks/managed-agent-hook-controls', () => ({
  isAgentStatusHooksEnabled: vi.fn()
}))
vi.mock('../daemon/daemon-init', () => ({ getDaemonProvider: vi.fn() }))
vi.mock('../../shared/runtime-environment-store', () => ({ resolveEnvironment: vi.fn() }))
vi.mock('../../shared/runtime-environments', () => ({ getPreferredPairingOffer: vi.fn() }))
vi.mock('../runtime/orchestration/environment-transport', () => ({
  fingerprintOrchestrationPeer: vi.fn()
}))
vi.mock('../ipc/runtime-environment-transport-routing', () => ({ callRuntimeEnvironment: vi.fn() }))
vi.mock('./codex-launch-preparation', () => ({ prepareCodexRuntimeHomeForLaunch: vi.fn() }))
vi.mock('../artifacts/artifact-cloud-service', () => ({ ArtifactCloudService: vi.fn() }))
vi.mock('../skills/skill-cloud-service', () => ({ SkillCloudService: vi.fn() }))
vi.mock('../../shared/artifact-sharing-gate', () => ({ isArtifactSharingEnabled: vi.fn() }))
vi.mock('../runtime/agent-status-observed-pane-identity', () => ({
  AgentStatusObservedPaneIdentities: vi.fn(),
  recordObservedAgentStatusPaneIdentity: vi.fn()
}))
vi.mock('../runtime/agent-state-rules/agent-state-rules-live-update', () => ({
  startAgentStateRulesLiveUpdates: vi.fn()
}))
vi.mock('../crash-reporting/durable-crash-breadcrumb', () => ({
  recordDurableCrashBreadcrumb: vi.fn()
}))
vi.mock('../ipc/keybindings', () => ({ broadcastKeybindingsChanged: vi.fn() }))
vi.mock('../system-fonts', () => ({ listSystemFontFamilies: vi.fn() }))
import { initializeMainProcessRuntime } from './main-process-runtime-service'

afterEach(() => {
  setAccountSecretSettingsWriter(null)
  setAccountPreferenceAccess(null)
  setAgentPermissionModeAccess(null)
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

it('binds all account controls to the desktop writer and awaits durable flush before acknowledging', async () => {
  let settings = createGlobalSettingsFixture({ minimaxEndpoint: 'overseas' })
  fixture.getSettings.mockImplementation(() => settings)
  fixture.apply.mockImplementation(async (_store: unknown, patch: Partial<GlobalSettings>) => {
    settings = { ...settings, ...patch }
    return settings
  })
  initializeMainProcessRuntime()
  await expect(
    manageAccountPreference({ action: 'set', key: 'minimaxEndpoint', value: 'cn' })
  ).resolves.toEqual({ key: 'minimaxEndpoint', updated: true })
  await expect(
    applyAccountSecretSetting({
      action: 'set',
      key: 'opencodeSessionCookie',
      input: 'fixture-private-cookie'
    })
  ).resolves.toEqual({ key: 'opencodeSessionCookie', updated: true })
  await manageAgentPermissionMode({ action: 'set', mode: 'yolo' })
  expect(settings.minimaxEndpoint).toBe('cn')
  expect(settings.opencodeSessionCookie).toBe('fixture-private-cookie')
  expect(settings.agentDefaultArgs).toMatchObject({
    codex: '--dangerously-bypass-approvals-and-sandbox'
  })
  if (!fixture.actions.current) {
    throw new Error('Missing settings actions')
  }
  await fixture.actions.current.updateDesktopSettings({ theme: 'dark' })
  expect(settings.theme).toBe('dark')
  expect(fixture.apply).toHaveBeenCalledTimes(4)
  expect(fixture.flush).toHaveBeenCalledTimes(4)
  expect(fixture.flush).toHaveBeenLastCalledWith({ drainToStableGeneration: true })
  const flushCompletion = Promise.withResolvers<void>()
  fixture.flush.mockImplementationOnce(() => flushCompletion.promise)
  let acknowledged = false
  const pending = manageAccountPreference({
    action: 'set',
    key: 'zcodePlanSite',
    value: 'bigmodel'
  }).then(() => {
    acknowledged = true
  })
  await vi.waitFor(() => expect(fixture.flush).toHaveBeenCalledTimes(5))
  expect(acknowledged).toBe(false)
  flushCompletion.resolve()
  await pending
  expect(acknowledged).toBe(true)
  fixture.flush.mockRejectedValueOnce(new Error('fixture-private-flush-error'))
  await expect(
    applyAccountSecretSetting({ action: 'clear', key: 'opencodeSessionCookie' })
  ).rejects.toThrow('canonical settings writer could not apply')
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  await manageAccountPreference({ action: 'set', key: 'localAccountWslDistro', value: 'Ubuntu' })
  expect(settings.localAccountRuntime).toBe('wsl')
  const calls = fixture.apply.mock.calls.length
  await expect(
    manageAccountPreference({ action: 'set', key: 'localAccountWslDistro', value: 'Missing' })
  ).rejects.toThrow('not available')
  fixture.available.mockResolvedValueOnce(false)
  await expect(
    manageAccountPreference({ action: 'set', key: 'localAccountRuntime', value: 'wsl' })
  ).rejects.toThrow('not available')
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
  await expect(
    manageAccountPreference({ action: 'set', key: 'localAccountRuntime', value: 'wsl' })
  ).rejects.toThrow('not available')
  expect(fixture.apply).toHaveBeenCalledTimes(calls)
})
