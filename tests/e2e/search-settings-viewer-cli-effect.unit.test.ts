// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createServer, type Socket } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { SEARCH_SETTINGS_VIEWER_COMMAND_SPECS } from '../../src/cli/specs/search-settings-viewer'
import { SEARCH_SETTINGS_VIEWER_HANDLERS } from '../../src/cli/handlers/search-settings-viewer'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { Store } from '../../src/main/persistence'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { SEARCH_SETTINGS_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/search-settings-viewer'
import { applySearchSettingsViewerRequest } from '../../src/renderer/src/runtime/search-settings-viewer-bridge'
import { SessionHistorySettingsPane } from '../../src/renderer/src/components/settings/SessionHistorySettingsPane'
import { ConfirmationDialogContext } from '../../src/renderer/src/components/confirmation-dialog-context'
import { unavailableSessionSearchStatus } from '../../src/shared/ai-vault-search-client'

const fixture = vi.hoisted(() => {
  const environments: { id: string; name: string }[] = []
  const details: Record<string, unknown> = {}
  return { getState: () => ({}), environments, details }
})
vi.mock('@/store', () => ({
  useAppStore: Object.assign((select: (state: object) => unknown) => select(fixture.getState()), {
    getState: () => fixture.getState()
  })
}))
vi.mock('../../src/renderer/src/components/settings/use-runtime-environment-catalog', () => ({
  useRuntimeEnvironmentCatalog: () => ({
    environments: fixture.environments,
    detailsByEnvironmentId: fixture.details
  })
}))
vi.mock('@/hooks/use-window-stream-visibility', () => ({ useWindowStreamVisible: () => true }))
vi.mock('@/lib/web-client-location', () => ({ isWebClientLocation: () => false }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

it.skipIf(process.platform === 'win32')(
  'uses the socket, viewer and actual search settings owner',
  async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const root = mkdtempSync(join(tmpdir(), 'orca-search-viewer-'))
    const store = new Store({
      serializedState: JSON.stringify({ settings: { aiVaultSearch: { enabled: false } } }),
      dataFile: join(root, 'profile.json')
    })
    const markFeatureTipsSeen = vi.fn()
    let settingsNavigationTarget: { pane: string; repoId: null; sectionId?: string } | null = null
    const openSettingsTarget = vi.fn((target: NonNullable<typeof settingsNavigationTarget>) => {
      settingsNavigationTarget = target
    })
    const openSettingsPage = vi.fn()
    fixture.getState = () => ({
      persistedUIReady: true,
      settingsNavigationTarget,
      settings: store.getSettings(),
      markFeatureTipsSeen,
      openSettingsTarget,
      openSettingsPage,
      closeSettingsPage: vi.fn(),
      showAiVaultSearch: vi.fn()
    })
    Object.assign(window, {
      api: {
        settings: { get: async () => store.getSettings() },
        aiVault: {
          searchStatus: async (host: string) => {
            if (host === 'runtime:older') {
              throw new Error('host-too-old')
            }
            return {
              ...unavailableSessionSearchStatus(),
              enabled: store.getSettings().aiVaultSearch?.enabled === true
            }
          }
        }
      }
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const ui = createRoot(container)
    const renderPane = (): void =>
      ui.render(
        createElement(
          ConfirmationDialogContext.Provider,
          { value: async () => false },
          createElement(SessionHistorySettingsPane, {
            settings: store.getSettings(),
            updateSettings: async (updates) => {
              store.updateSettings(updates)
              renderPane()
            }
          })
        )
      )
    const runtime = new OrcaRuntimeService(store)
    runtime.setNotifier({
      searchSettingsViewer: async (command) => ({
        ...(await applySearchSettingsViewerRequest({
          id: 'fixture',
          command,
          expiresAt: Date.now() + 2000
        })),
        viewerId: 7
      })
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: SEARCH_SETTINGS_VIEWER_METHODS })
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
        if (request.authToken !== 'fixture-token') {
          socket.destroy()
          return
        }
        void dispatcher
          .dispatch(request)
          .then((response) => socket.write(`${JSON.stringify(response)}\n`))
      })
    })
    try {
      await act(async () => renderPane())
      const endpoint = join(root, 'runtime.sock')
      await new Promise<void>((resolve) => server.listen(endpoint, resolve))
      writeFileSync(
        join(root, 'orca-runtime.json'),
        JSON.stringify({
          runtimeId: runtime.getRuntimeId(),
          pid: process.pid,
          transports: [{ kind: 'unix', endpoint }],
          authToken: 'fixture-token',
          startedAt: 1
        })
      )
      const client = new RuntimeClient(root, 5000, null, null)
      const output = vi.spyOn(console, 'log').mockImplementation(() => {})
      async function invoke(confirmation = 'local', operation = 'local-toggle', target?: string) {
        const parsed = parseArgs(
          [
            'search',
            'viewer',
            '--viewer',
            'host',
            '--operation',
            operation,
            ...(target ? ['--target-host', target] : ['--confirm', confirmation])
          ],
          SEARCH_SETTINGS_VIEWER_COMMAND_SPECS.map((spec) => spec.path)
        )
        validateCommandAndFlags(SEARCH_SETTINGS_VIEWER_COMMAND_SPECS, parsed)
        const handler = SEARCH_SETTINGS_VIEWER_HANDLERS['search viewer']
        if (!handler) {
          throw new Error('Missing search settings handler')
        }
        await handler({ client, flags: parsed.flags, cwd: root, json: true })
      }
      for (const enabled of [true, false]) {
        await act(async () => invoke())
        expect(store.getSettings().aiVaultSearch?.enabled).toBe(enabled)
        expect(container.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe(
          String(enabled)
        )
        expect(output.mock.calls.at(-1)?.[0]).toContain('"persisted": true')
      }
      expect(markFeatureTipsSeen).toHaveBeenCalledTimes(2)
      expect(openSettingsTarget).toHaveBeenCalledWith({ pane: 'session-history', repoId: null })
      await expect(invoke('wrong')).rejects.toThrow()
      expect(store.getSettings().aiVaultSearch?.enabled).toBe(false)
      fixture.environments.push({ id: 'older', name: 'Old server' })
      fixture.details.older = {
        status: 'ready',
        runtimeStatus: { appVersion: '1.4.0' },
        compatibility: { kind: 'ok' },
        remoteControl: null,
        error: null
      }
      await act(async () => renderPane())
      await vi.waitFor(() => expect(container.textContent).toContain('Update server'))
      await act(async () => invoke('local', 'server-settings-open', 'runtime:older'))
      expect(settingsNavigationTarget).toEqual({
        pane: 'servers',
        repoId: null,
        sectionId: 'older'
      })
      expect(output.mock.calls.at(-1)?.[0]).toContain('"applied": true')
      expect(store.getSettings().aiVaultSearch?.enabled).toBe(false)
    } finally {
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await act(async () => ui.unmount())
      container.remove()
      fixture.environments.length = 0
      fixture.details = {}
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
      rmSync(root, { recursive: true, force: true })
    }
  }
)
