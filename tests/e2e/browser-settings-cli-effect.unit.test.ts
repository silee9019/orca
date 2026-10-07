// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { verifyBrowserSettingsCookies } from './browser-settings-cookie-story.fixture'
import { cookieFixture } from './browser-settings-cookie.fixture'
import { RuntimeBrowserCommandsWithBrowserProfileImportFromBrowser } from '../../src/main/runtime/runtime-browser-commands-browser-profile-import-from-browser'
import { BROWSER_PROFILE_FILE_METHODS } from '../../src/main/runtime/rpc/methods/browser-profile-file'
import { BROWSER_USE_ENABLED_STORAGE_KEY } from '../../src/renderer/src/lib/browser-use-setup-state'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Socket } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { BROWSER_SESSION_META_FILE_NAME } from '../../src/main/browser/browser-session-meta-store'
import { browserSessionRegistry } from '../../src/main/browser/browser-session-registry'
import { Store } from '../../src/main/persistence'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { BROWSER_SETTINGS_VIEWER_SPECS } from '../../src/cli/specs/browser-settings-viewer'
import { BROWSER_SETTINGS_VIEWER_HANDLERS } from '../../src/cli/handlers/browser-settings-viewer'
import { BROWSER_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/browser-viewer'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import { TooltipProvider } from '../../src/renderer/src/components/ui/tooltip'
import {
  BrowserSettingsNavigationFixture,
  browserNavigationFixture
} from './browser-settings-navigation.fixture'
import { resetSkillDiscoveryCacheForTests } from '../../src/renderer/src/hooks/installed-agent-skill-discovery'
import { ORCA_CLI_SKILL_NAME } from '../../src/renderer/src/lib/agent-feature-install-commands'
import type { SkillDiscoveryTarget } from '../../src/shared/skills'
import { useAppStore } from '../../src/renderer/src/store'
vi.mock('../../src/renderer/src/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({
    installDisabledReason: null,
    canUseLocalSkillFreshness: false
  })
}))
vi.mock('../../src/renderer/src/components/settings/AgentSkillSetupPanel', () => ({
  AgentSkillSetupPanel: () => null
}))
vi.mock('../../src/renderer/src/components/settings/BrowserUserAgentSetting', () => ({
  BrowserUserAgentSetting: () => null
}))
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: () => {
    throw new Error('Fixture refuses app launch')
  }
}))
vi.mock('../../src/main/browser/browser-session-partition-policies', () => ({
  installBrowserSessionPartitionPolicies: async () => {},
  forgetBrowserSessionPartitionConfiguration: () => {},
  retireBrowserSessionUserAgentPolicy: () => {}
}))
const directories: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const path of directories.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})
it.skipIf(process.platform === 'win32')(
  'applies settings through CLI, socket, dispatcher, existing bridge, mounted pane and actual UI store',
  async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const directory = mkdtempSync(join(tmpdir(), 'orca-browser-settings-owner-'))
    directories.push(directory)
    cookieFixture.directory = directory
    cookieFixture.jars.clear()
    localStorage.setItem(BROWSER_USE_ENABLED_STORAGE_KEY, '1')
    const store = new Store({
      serializedState: JSON.stringify({ repos: [], settings: {} }),
      dataFile: join(directory, 'profile.json')
    })
    browserSessionRegistry.configureForOrcaProfile({
      orcaProfileId: 'fixture-browser-owner',
      profileDirectory: directory
    })
    const runtime = new OrcaRuntimeService(store)
    resetSkillDiscoveryCacheForTests()
    const skillScans: (SkillDiscoveryTarget | undefined)[] = []
    let skillInstalled = true
    let skillFailure = false
    Object.assign(window, {
      api: {
        skills: {
          discover: async (target?: SkillDiscoveryTarget) => {
            skillScans.push(target)
            if (skillFailure) {
              throw new Error('private-fixture-discovery-error')
            }
            return {
              scannedAt: Date.now(),
              sources: [],
              skills: skillInstalled
                ? [
                    {
                      id: 'fixture-cli',
                      name: ORCA_CLI_SKILL_NAME,
                      description: null,
                      providers: ['codex'],
                      sourceKind: 'home',
                      sourceLabel: 'fixture',
                      rootPath: directory,
                      directoryPath: join(directory, ORCA_CLI_SKILL_NAME),
                      skillFilePath: join(directory, ORCA_CLI_SKILL_NAME, 'SKILL.md'),
                      installed: true,
                      updatedAt: 1
                    }
                  ]
                : []
            }
          }
        },
        runtime: {
          call: async ({ method, params }: { method: string; params: unknown }) =>
            dispatcher.dispatch({ id: 'owner-file-import', method, params })
        },
        browser: {
          sessionListProfiles: async () => browserSessionRegistry.listProfiles(),
          sessionDetectBrowsers: async () => cookieFixture.browsers,
          sessionDeleteProfile: async ({ profileId }: { profileId: string }) =>
            browserSessionRegistry.deleteProfile(profileId),
          sessionClearDefaultCookies: async () =>
            browserSessionRegistry.clearDefaultSessionCookies(),
          sessionImportFromBrowser: async (
            params: Parameters<
              RuntimeBrowserCommandsWithBrowserProfileImportFromBrowser['browserProfileImportFromBrowser']
            >[0]
          ) =>
            RuntimeBrowserCommandsWithBrowserProfileImportFromBrowser.prototype.browserProfileImportFromBrowser(
              params
            ),
          sessionCreateProfile: async (
            params: Parameters<OrcaRuntimeService['browserProfileCreate']>[0]
          ) => {
            return browserSessionRegistry.createProfile(params.scope, params.label)
          }
        },
        ui: {
          recordFeatureInteraction: async (id: Parameters<Store['recordFeatureInteraction']>[0]) =>
            store.recordFeatureInteraction(id),
          set: async (updates: Parameters<Store['updateUI']>[0]) => {
            store.updateUI(updates)
          }
        }
      }
    })
    useAppStore.setState({
      runtimeEnvironmentCatalogSettled: true,
      runtimeEnvironments: [],
      settings: store.getSettings(),
      persistedUIReady: true,
      activeModal: null,
      settingsSearchQuery: '',
      browserDefaultUrl: null
    })
    const container = document.createElement('div')
    document.body.append(container)
    const owner = createRoot(container)
    await act(async () =>
      owner.render(
        createElement(
          TooltipProvider,
          {},
          createElement(BrowserSettingsNavigationFixture, { settings: store.getSettings() })
        )
      )
    )
    runtime.setNotifier({
      browserViewer: async (command) => ({
        ...(await applyBrowserViewerRequest({
          id: 'browser-settings-fixture',
          expiresAt: Date.now() + 3000,
          command
        })),
        viewerId: 8
      })
    })
    const dispatcher = new RpcDispatcher({
      runtime,
      methods: [...BROWSER_VIEWER_METHODS, ...BROWSER_PROFILE_FILE_METHODS]
    })
    const sockets = new Set<Socket>()
    const server = createServer((socket) => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
      let pending = ''
      socket.on('data', (chunk) => {
        pending += chunk.toString()
        const boundary = pending.indexOf('\n')
        if (boundary === -1) {
          return
        }
        const request = JSON.parse(pending.slice(0, boundary))
        pending = pending.slice(boundary + 1)
        if (request.authToken !== 'settings-fixture-token') {
          socket.destroy()
          return
        }
        void dispatcher
          .dispatch(request)
          .then((response) => socket.write(`${JSON.stringify(response)}\n`))
      })
    })
    const endpoint = join(directory, 'runtime.sock')
    await new Promise<void>((resolve) => server.listen(endpoint, resolve))
    writeFileSync(
      join(directory, 'orca-runtime.json'),
      JSON.stringify({
        runtimeId: runtime.getRuntimeId(),
        pid: process.pid,
        transports: [{ kind: 'unix', endpoint }],
        authToken: 'settings-fixture-token',
        startedAt: 1
      })
    )
    const client = new RuntimeClient(directory, 5000, null, null)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    async function invoke(action: string, flags: string[] = [], host = 'local', pump = true) {
      const specs = BROWSER_SETTINGS_VIEWER_SPECS
      const parsed = parseArgs(
        [
          'browser',
          'settings',
          'viewer',
          '--viewer',
          'host',
          '--action',
          action,
          '--host',
          host,
          ...flags
        ],
        specs.map((spec) => spec.path),
        specs
      )
      validateCommandAndFlags(specs, parsed)
      const pending = BROWSER_SETTINGS_VIEWER_HANDLERS['browser settings viewer']({
        client,
        flags: parsed.flags,
        cwd: directory,
        json: true
      })
      void pending.catch(() => {})
      if (!pump) {
        return pending
      }
      let settled = false
      void pending.then(
        () => {
          settled = true
        },
        () => {
          settled = true
        }
      )
      await vi.waitFor(async () => {
        await act(async () => {})
        expect(settled).toBe(true)
      })
      await pending.catch((error) => {
        throw new Error(
          `Action ${action} failed: ${error instanceof Error ? error.message : 'unknown'}`,
          { cause: error }
        )
      })
    }
    try {
      await invoke('homepage-draft', ['--value', 'https://draft.fixture.invalid'])
      expect(container.querySelector('input')).toHaveProperty(
        'value',
        'https://draft.fixture.invalid'
      )
      expect(store.getUI().browserDefaultUrl).not.toBe('https://draft.fixture.invalid')
      expect(output.mock.calls.at(-1)?.[0]).toContain('"persisted": false')
      await invoke('homepage-save')
      expect(useAppStore.getState().browserDefaultUrl).toBe('https://draft.fixture.invalid/')
      expect(store.getUI().browserDefaultUrl).toBe('https://draft.fixture.invalid/')
      await invoke('search-engine', ['--value', 'bing'])
      expect(useAppStore.getState().browserDefaultSearchEngine).toBe('bing')
      expect(store.getUI().browserDefaultSearchEngine).toBe('bing')
      await invoke('profile-dialog-open')
      await invoke('profile-name', ['--value', 'Fixture Profile'])
      expect(container.ownerDocument.querySelector('[role="dialog"] input')).toHaveProperty(
        'value',
        'Fixture Profile'
      )
      await invoke('profile-create')
      const created = useAppStore
        .getState()
        .browserSessionProfiles.find((profile) => profile.label === 'Fixture Profile')
      expect(created).toBeDefined()
      if (!created) {
        throw new Error('Fixture profile missing')
      }
      await invoke('profile-select', ['--profile', created.id])
      expect(useAppStore.getState().defaultBrowserSessionProfileIdByHostId.local).toBe(created.id)
      await invoke('profile-select', ['--profile', 'default'])
      expect(useAppStore.getState().defaultBrowserSessionProfileId).toBeNull()
      await invoke('host-select', ['--value', 'local'])
      expect(useAppStore.getState().detectedBrowsersLoaded).toBe(true)
      await invoke('zoom', ['--value', '0'])
      expect(store.getUI().browserDefaultZoomLevel).toBe(0)
      await expect(
        invoke('homepage-draft', ['--value', 'wrong-host'], 'runtime:missing')
      ).rejects.toThrow('browser_settings_action_failed_effect_unknown')
      expect(useAppStore.getState().browserDefaultUrl).toBe('https://draft.fixture.invalid/')
      expect(readFileSync(join(directory, BROWSER_SESSION_META_FILE_NAME), 'utf8')).toContain(
        'Fixture Profile'
      )
      await verifyBrowserSettingsCookies(invoke, created, directory, container, store, output)
      const scroll = vi.fn()
      const originalScroll = HTMLElement.prototype.scrollIntoView
      HTMLElement.prototype.scrollIntoView = scroll
      try {
        await act(async () => useAppStore.getState().setSettingsSearchQuery('no-cookie-match'))
        await invoke('cookies-scroll')
        expect(useAppStore.getState().settingsSearchQuery).toBe('')
        expect(document.getElementById('browser-session-cookies')).not.toBeNull()
        expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
        expect(output.mock.calls.at(-1)?.[0]).toContain('"cookiesScrolled": true')
        await invoke('cookies-configure', ['--profile', 'default', '--surface', 'browser-use'])
        await invoke('browser-use-configure')
      } finally {
        HTMLElement.prototype.scrollIntoView = originalScroll
      }
      browserNavigationFixture.allowDiscard = false
      await expect(invoke('computer-use-open')).rejects.toThrow('effect_unknown')
      expect(browserNavigationFixture.section).toBe('')
      expect(browserNavigationFixture.scrollTarget).toBe('')
      expect(browserNavigationFixture.requestTick).toBe(0)
      browserNavigationFixture.allowDiscard = true
      await invoke('computer-use-open')
      expect(browserNavigationFixture.section).toBe('computer-use')
      expect(browserNavigationFixture.scrollTarget).toBe('computer-use')
      expect(browserNavigationFixture.requestTick).toBe(1)
      await invoke('browser-use-computer')
      expect(browserNavigationFixture.requestTick).toBe(2)
      await invoke('browser-use-enabled', ['--value', 'false'])
      expect(localStorage.getItem(BROWSER_USE_ENABLED_STORAGE_KEY)).toBe('0')
      expect(output.mock.calls.at(-1)?.[0]).toContain('"browserUseEnabled": false')
      await invoke('browser-use-enabled', ['--value', 'true'])
      expect(localStorage.getItem(BROWSER_USE_ENABLED_STORAGE_KEY)).toBe('1')
      expect(store.getUI().featureInteractions?.['agent-browser-setup']?.interactionCount).toBe(1)
      await invoke('browser-use-install-intent')
      expect(store.getUI().featureInteractions?.['agent-browser-setup']?.interactionCount).toBe(2)
      skillInstalled = false
      await invoke('browser-use-refresh')
      expect(skillScans.at(-1)?.refresh).toBe(true)
      expect(output.mock.calls.at(-1)?.[0]).toContain('"skillDetected": false')
      expect(output.mock.calls.at(-1)?.[0]).toContain('"skillLoading": false')
      skillFailure = true
      await expect(invoke('browser-use-refresh')).rejects.toThrow(
        'Browser skill scan did not establish a current result.'
      )
      expect(JSON.stringify(output.mock.calls)).not.toContain('private-fixture')
      await invoke('profile-dialog-open')
      await invoke('profile-dialog-status')
      expect(output.mock.calls.at(-1)?.[0]).toContain('"dialogOpen": true')
      expect(output.mock.calls.at(-1)?.[0]).toContain('"creating": false')
      await invoke('profile-name', ['--value', 'Discarded draft'])
      await invoke('profile-dialog-close')
      expect(container.ownerDocument.querySelector('[role="dialog"]')).toBeNull()
      await expect(invoke('host-select', ['--value', 'runtime:missing'])).rejects.toThrow(
        'browser_settings_action_failed_effect_unknown'
      )
    } finally {
      await act(async () => owner.unmount())
      container.remove()
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
)
