// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
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
import { BrowserPane } from '../../src/renderer/src/components/settings/BrowserPane'
import { useAppStore } from '../../src/renderer/src/store'
vi.mock('../../src/renderer/src/components/settings/BrowserUsePane', () => ({
  BrowserUseSetup: () => null
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
    const store = new Store({
      serializedState: JSON.stringify({ repos: [], settings: {} }),
      dataFile: join(directory, 'profile.json')
    })
    browserSessionRegistry.configureForOrcaProfile({
      orcaProfileId: 'fixture-browser-owner',
      profileDirectory: directory
    })
    const runtime = new OrcaRuntimeService(store)
    Object.assign(window, {
      api: {
        browser: {
          sessionListProfiles: async () => browserSessionRegistry.listProfiles(),
          sessionDetectBrowsers: async () => [],
          sessionCreateProfile: async (
            params: Parameters<OrcaRuntimeService['browserProfileCreate']>[0]
          ) => {
            return browserSessionRegistry.createProfile(params.scope, params.label)
          }
        },
        ui: {
          set: async (updates: Parameters<Store['updateUI']>[0]) => {
            store.updateUI(updates)
          }
        }
      }
    })
    useAppStore.setState({
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
          createElement(BrowserPane, { settings: store.getSettings(), updateSettings: () => {} })
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
    const dispatcher = new RpcDispatcher({ runtime, methods: BROWSER_VIEWER_METHODS })
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
    async function invoke(action: string, flags: string[] = [], host = 'local') {
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
      await pending
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
      await invoke('profile-dialog-open')
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
