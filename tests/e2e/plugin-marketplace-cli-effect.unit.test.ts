// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import {
  readFixtureMarketplaceListings,
  verifyMarketplaceCatalogReload
} from './plugin-marketplace-catalog-story.fixture'
import { act, createElement } from 'react'
import {
  fixtureMarketplacePreviewApi,
  marketplaceViewerArguments,
  verifyMarketplacePreview
} from './plugin-marketplace-preview-story.fixture'
import { createRoot } from 'react-dom/client'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Socket } from 'node:net'
import { expect, it, vi } from 'vitest'
import type {
  PluginMarketplaceHostListing,
  PluginMarketplaceHostSourceState
} from '../../src/preload/api-types'
import { Store } from '../../src/main/persistence'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { BROWSER_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/browser-viewer'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { PLUGIN_MARKETPLACE_VIEWER_SPECS } from '../../src/cli/specs/plugin-marketplace-viewer'
import { PLUGIN_MARKETPLACE_VIEWER_HANDLERS } from '../../src/cli/handlers/plugin-marketplace-viewer'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import { requestPluginMarketplace } from '../../src/renderer/src/runtime/plugin-marketplace-request'
import { ActiveSettingsSectionProvider } from '../../src/renderer/src/components/settings/SettingsSection'
import { PluginsSettingsSection } from '../../src/renderer/src/components/settings/PluginsSettingsSection'
import { TooltipProvider } from '../../src/renderer/src/components/ui/tooltip'
import { useAppStore } from '../../src/renderer/src/store'
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: () => {
    throw new Error('Fixture refuses app launch')
  }
}))
it.skipIf(process.platform === 'win32')(
  'filters the actual catalog through CLI, socket, dispatcher and existing viewer transport',
  async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const directory = mkdtempSync(join(tmpdir(), 'orca-marketplace-owner-'))
    const store = new Store({
      serializedState: JSON.stringify({ repos: [], settings: { pluginSystemEnabled: true } }),
      dataFile: join(directory, 'profile.json')
    })
    const runtime = new OrcaRuntimeService(store)
    const providerCalls: string[] = []
    let releaseSourceRefresh: (() => void) | undefined
    const source: PluginMarketplaceHostSourceState = {
      id: 'fixture-source',
      source: { kind: 'git', url: 'https://example.invalid/catalog.git', ref: 'main' },
      addedAt: 1,
      marketplace: {
        name: 'Fixture catalog',
        owner: 'Fixture publisher',
        resolvedCommit: 'fixture-commit',
        fetchedAt: 1
      },
      stale: false,
      official: false
    }
    const listings: PluginMarketplaceHostListing[] = ['alpha', 'beta'].map((name) => ({
      marketplaceSourceId: source.id,
      marketplaceName: 'Fixture catalog',
      marketplaceOwner: 'Fixture publisher',
      marketplaceCommit: 'fixture-commit',
      pluginKey: `fixture.${name}`,
      source: source.source,
      description: name === 'alpha' ? 'private-fixture-query' : 'Other listing',
      categories: ['fixture'],
      official: false,
      bundled: false
    }))
    Object.assign(window, {
      api: {
        plugins: {
          refreshMarketplaces: async () => {
            providerCalls.push('source-refresh')
            await new Promise<void>((resolve) => {
              releaseSourceRefresh = resolve
            })
          },
          ...fixtureMarketplacePreviewApi(listings),
          listMarketplaces: async () => {
            providerCalls.push('sources')
            return [source]
          },
          listMarketplacePlugins: async () => {
            providerCalls.push('listings')
            return await readFixtureMarketplaceListings(listings)
          }
        }
      }
    })
    useAppStore.setState({
      settings: store.getSettings(),
      persistedUIReady: true,
      activeModal: 'none',
      activeView: 'settings'
    })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const renderOwner = async (
      mounted = true,
      copies = 1,
      activePane = 'plugins'
    ): Promise<void> => {
      await act(async () =>
        root.render(
          mounted
            ? createElement(
                TooltipProvider,
                {},
                createElement(
                  ActiveSettingsSectionProvider,
                  { value: activePane },
                  Array.from({ length: copies }, (_, index) =>
                    createElement(PluginsSettingsSection, {
                      key: index,
                      mounted: true,
                      settings: store.getSettings(),
                      updateSettings: async () => {
                        throw new Error('Fixture refuses settings writes')
                      }
                    })
                  )
                )
              )
            : null
        )
      )
    }
    await renderOwner()
    runtime.setNotifier({
      browserViewer: async (command) => ({
        ...(await applyBrowserViewerRequest({
          id: 'marketplace-fixture',
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
        if (request.authToken !== 'fixture-token') {
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
        authToken: 'fixture-token',
        startedAt: 1
      })
    )
    const client = new RuntimeClient(directory, 5000, null, null)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const invoke = async (
      action: string,
      value?: string,
      target?: { source: string; plugin: string }
    ): Promise<void> => {
      const specs = PLUGIN_MARKETPLACE_VIEWER_SPECS
      const parsed = parseArgs(
        marketplaceViewerArguments(action, value, target),
        specs.map((s) => s.path),
        specs
      )
      validateCommandAndFlags(specs, parsed)
      const pending = PLUGIN_MARKETPLACE_VIEWER_HANDLERS['plugins marketplace viewer']({
        client,
        flags: parsed.flags,
        cwd: directory,
        json: true
      })
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
      expect(providerCalls).toEqual(['sources', 'listings'])
      expect(container.querySelectorAll('[data-marketplace-plugin-key]')).toHaveLength(2)
      await verifyMarketplaceCatalogReload(invoke, container)
      await verifyMarketplacePreview(invoke, source.id, listings)
      await invoke('search', 'private-fixture-query')
      expect(container.querySelector('input')?.value).toBe('private-fixture-query')
      expect(container.querySelectorAll('[data-marketplace-plugin-key]')).toHaveLength(1)
      expect(
        container
          .querySelector('[data-marketplace-plugin-key]')
          ?.getAttribute('data-marketplace-plugin-key')
      ).toBe('fixture.alpha')
      await invoke('filter', 'installed')
      expect(container.textContent).toContain('No installed plugins match this search.')
      expect(container.querySelector('[data-state="active"]')?.textContent).toContain('Installed')
      expect(output.mock.calls.at(-1)?.[0]).not.toContain('private-fixture-query')
      expect(JSON.parse(output.mock.calls.at(-1)?.[0]).result.persisted).toBe(false)
      await invoke('search', '')
      expect(container.querySelector('input')?.value).toBe('')
      await invoke('filter', 'all')
      expect(container.textContent).not.toContain('No installed plugins match this search.')
      expect(container.querySelectorAll('[data-marketplace-plugin-key]')).toHaveLength(2)
      await invoke('search', 'no-fixture-match')
      expect(container.querySelectorAll('[data-marketplace-plugin-key]')).toHaveLength(0)
      expect(container.textContent).toContain('Clear search')
      await invoke('search', '')
      expect(container.querySelectorAll('[data-marketplace-plugin-key]')).toHaveLength(2)
      await expect(invoke('filter', 'invalid')).rejects.toThrow('valid marketplace')
      useAppStore.setState({ activeView: 'terminal' })
      await expect(invoke('search', 'inactive')).rejects.toThrow(
        'plugin_marketplace_settings_inactive'
      )
      expect(container.querySelector('input')?.value).toBe('')
      useAppStore.setState({ activeView: 'settings' })
      useAppStore.setState({ activeModal: 'settings-confirm-discard' })
      await expect(invoke('search', 'blocked')).rejects.toThrow('viewer_modal_busy')
      expect(container.querySelector('input')?.value).toBe('')
      useAppStore.setState({
        activeModal: 'none',
        settings: { ...store.getSettings(), activeRuntimeEnvironmentId: 'remote-fixture' }
      })
      await expect(invoke('search', 'blocked')).rejects.toThrow('viewer_runtime_mismatch')
      useAppStore.setState({ settings: store.getSettings() })
      let switchedRequest: Promise<unknown> = Promise.resolve()
      await act(async () => {
        switchedRequest = requestPluginMarketplace(
          { action: 'search', value: 'transient-query' },
          Date.now() + 3000
        )
        void switchedRequest.catch(() => {})
        useAppStore.setState({
          settings: { ...store.getSettings(), activeRuntimeEnvironmentId: 'remote-fixture' }
        })
      })
      await expect(switchedRequest).rejects.toThrow(
        'plugin_marketplace_viewer_changed_effect_unknown'
      )
      useAppStore.setState({ settings: store.getSettings() })
      await invoke('search', '')
      await expect(
        applyBrowserViewerRequest({
          id: 'expired-marketplace',
          expiresAt: Date.now() - 1,
          command: {
            viewer: 'host',
            operation: 'plugin-marketplace',
            command: { action: 'search', value: 'expired' }
          }
        })
      ).rejects.toThrow('request_expired')
      await expect(
        client.call('ui.browserViewer', {
          viewer: 'paired',
          operation: 'plugin-marketplace',
          command: { action: 'search', value: 'paired' }
        })
      ).rejects.toThrow()
      const manage = Array.from(container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Manage sources')
      )
      expect(manage).toBeDefined()
      await act(async () => manage?.click())
      await invoke('status')
      expect(JSON.parse(output.mock.calls.at(-1)?.[0]).result.marketplace.sourcesOpen).toBe(true)
      await expect(invoke('search', 'blocked-dialog')).rejects.toThrow(
        'plugin_marketplace_dialog_busy'
      )
      expect(container.querySelector('input')?.value).toBe('')
      await invoke('sources-close')
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(JSON.parse(output.mock.calls.at(-1)?.[0]).result.marketplace.sourcesOpen).toBe(false)
      await invoke('sources-open')
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      const refreshSource = document.querySelector<HTMLButtonElement>(
        '[aria-label="Refresh Fixture catalog"]'
      )
      expect(refreshSource).not.toBeNull()
      await act(async () => refreshSource?.click())
      const done = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')
      ).find((button) => button.textContent === 'Done')
      expect(done?.disabled).toBe(true)
      await expect(invoke('sources-close')).rejects.toThrow('plugin_marketplace_source_busy')
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      await act(async () => releaseSourceRefresh?.())
      await vi.waitFor(async () => {
        await act(async () => {})
        expect(done?.disabled).toBe(false)
      })
      await invoke('sources-close')
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(JSON.parse(output.mock.calls.at(-1)?.[0]).result.marketplace.sourcesOpen).toBe(false)
      expect(providerCalls.slice(-3)).toEqual(['source-refresh', 'sources', 'listings'])
      await renderOwner(false)
      await renderOwner(true, 2)
      expect(container.querySelectorAll('input[aria-label="Search plugins"]')).toHaveLength(2)
      await expect(invoke('search', 'ambiguous-owner')).rejects.toThrow(
        'plugin_marketplace_owner_ambiguous'
      )
      expect(
        Array.from(container.querySelectorAll('input[aria-label="Search plugins"]')).map(
          (input) => input.value
        )
      ).toEqual(['', ''])
      await expect(invoke('sources-open')).rejects.toThrow('plugin_marketplace_owner_ambiguous')
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      await renderOwner(false)
      await renderOwner(true, 1, 'browser')
      await expect(invoke('search', 'wrong-pane')).rejects.toThrow(
        'plugin_marketplace_owner_unavailable'
      )
      expect(container.querySelector('input[aria-label="Search plugins"]')).toBeNull()
      await renderOwner(true)
      const deadline = Date.now() + 5000
      let expiringRequest: Promise<unknown> = Promise.resolve()
      let restoreClock = () => {}
      try {
        await act(async () => {
          expiringRequest = requestPluginMarketplace(
            { action: 'search', value: 'deadline-query' },
            deadline
          )
          void expiringRequest.catch(() => {})
          const clock = vi.spyOn(Date, 'now').mockReturnValue(deadline + 1)
          restoreClock = () => clock.mockRestore()
        })
      } finally {
        restoreClock()
      }
      await expect(expiringRequest).rejects.toThrow(
        'plugin_marketplace_readback_expired_effect_unknown'
      )
      expect(container.querySelector('input')?.value).toBe('deadline-query')
      await invoke('search', '')
      await renderOwner(false)
      await expect(invoke('status')).rejects.toThrow('plugin_marketplace_owner_unavailable')
    } finally {
      await act(async () => {
        releaseSourceRefresh?.()
        root.unmount()
      })
      container.remove()
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise<void>((resolve) => server.close(() => resolve()))
      vi.restoreAllMocks()
      rmSync(directory, { recursive: true, force: true })
    }
  }
)
