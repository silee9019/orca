import { act } from 'react'
import { expect, vi } from 'vitest'
import { requestPluginMarketplace } from '../../src/renderer/src/runtime/plugin-marketplace-request'
import type { PluginMarketplaceViewerState } from '../../src/shared/rpc-contract/plugin-marketplace-viewer-params'
import { useAppStore } from '../../src/renderer/src/store'
import type {
  PluginHostListEntry,
  PluginMarketplaceHostInstallPreview,
  PluginMarketplaceHostListing
} from '../../src/preload/api-types'

let nextPreview: (() => Promise<PluginMarketplaceHostInstallPreview>) | undefined
type FixtureInstall = typeof window.api.plugins.installMarketplacePlugin
let installOverride: FixtureInstall | undefined
let listOverride: typeof window.api.plugins.list | undefined
export function configureMarketplaceInstallFixture(
  install?: FixtureInstall,
  list?: typeof window.api.plugins.list
): void {
  installOverride = install
  listOverride = list
}
export function fixtureMarketplaceInstalled(entries: PluginHostListEntry[]): void {
  installedPlugins = entries
}
let installedPlugins: PluginHostListEntry[] = []
const installedListeners = new Set<() => void>()
export function notifyFixtureInstalledChanged(): void {
  for (const listener of installedListeners) {
    listener()
  }
}
let releaseInstall: (() => void) | undefined
export function fixtureMarketplacePreviewApi(listings: PluginMarketplaceHostListing[]) {
  return {
    list: async () => (listOverride ? await listOverride() : [...installedPlugins]),
    onChanged: (listener: () => void) => {
      installedListeners.add(listener)
      return () => installedListeners.delete(listener)
    },
    previewMarketplaceUpdate: vi.fn(async (target: { pluginKey: string }) => {
      const listing = listings.find((entry) => entry.pluginKey === target.pluginKey)
      if (!listing) {
        throw new Error('fixture installed listing missing')
      }
      return nextPreview
        ? await nextPreview()
        : await fixtureMarketplacePreview(listings, {
            marketplaceSourceId: listing.marketplaceSourceId,
            pluginKey: target.pluginKey
          })
    }),
    previewMarketplacePlugin: async (target: { marketplaceSourceId: string; pluginKey: string }) =>
      nextPreview ? await nextPreview() : await fixtureMarketplacePreview(listings, target),
    installMarketplacePlugin: async (identity: Parameters<FixtureInstall>[0]) => {
      if (installOverride) {
        return await installOverride(identity)
      }
      await new Promise<void>((resolve) => {
        releaseInstall = resolve
      })
      return { ok: false as const, error: 'fixture refuses installation' }
    }
  }
}
async function fixtureMarketplacePreview(
  listings: PluginMarketplaceHostListing[],
  target: { marketplaceSourceId: string; pluginKey: string }
): Promise<PluginMarketplaceHostInstallPreview> {
  const listing = listings.find(
    (entry) =>
      entry.marketplaceSourceId === target.marketplaceSourceId &&
      entry.pluginKey === target.pluginKey
  )
  if (!listing) {
    throw new Error('fixture listing missing')
  }
  return {
    ...listing,
    resolvedCommit: 'c'.repeat(40),
    contentHash: 'd'.repeat(64),
    consentFingerprint: 'e'.repeat(64),
    manifest: {
      manifestVersion: 1,
      id: 'alpha',
      publisher: 'fixture',
      name: 'Fixture review',
      version: '1.0.0',
      engines: { orca: '>=1.0.0' },
      pluginApi: 1,
      main: 'dist/worker.js',
      contributes: {
        panels: [],
        commands: [],
        events: [],
        languagePacks: [],
        keybindings: [],
        vmRecipes: [],
        agents: []
      },
      capabilities: [{ kind: 'workspace:read' }]
    }
  }
}
export async function verifyMarketplacePreview(
  invoke: (
    action: string,
    value?: string,
    target?: { source: string; plugin: string }
  ) => Promise<void>,
  source: string,
  listings: PluginMarketplaceHostListing[]
): Promise<void> {
  const target = { source, plugin: 'fixture.alpha' }
  await expect(
    invoke('preview', undefined, { source: 'missing', plugin: target.plugin })
  ).rejects.toThrow('plugin_marketplace_listing_unavailable')
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  const uiPreview = document.querySelector<HTMLButtonElement>(
    '[data-marketplace-plugin-key="fixture.alpha"] button'
  )
  expect(uiPreview).not.toBeNull()
  let superseded: Promise<PluginMarketplaceViewerState> | undefined
  await act(async () => {
    superseded = requestPluginMarketplace({ action: 'preview', ...target }, Date.now() + 3000)
    void superseded.catch(() => {})
    for (let turn = 0; turn < 20; turn++) {
      await Promise.resolve()
    }
    uiPreview?.click()
  })
  await expect(superseded).rejects.toThrow('plugin_marketplace_preview_failed_effect_unknown')
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  await invoke('preview-close', undefined, target)
  const valid = await fixtureMarketplacePreview(listings, {
    marketplaceSourceId: source,
    pluginKey: target.plugin
  })
  nextPreview = async () => ({ ...valid, pluginKey: 'different-target' })
  await expect(invoke('preview', undefined, target)).rejects.toThrow(
    'plugin_marketplace_preview_failed_effect_unknown'
  )
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  let releasePreview = (): void => {}
  let previewStarted = false
  nextPreview = async () => {
    previewStarted = true
    await new Promise<void>((resolve) => {
      releasePreview = resolve
    })
    return valid
  }
  const settings = useAppStore.getState().settings
  const switched = invoke('preview', undefined, target)
  void switched.catch(() => {})
  try {
    await vi.waitFor(() => expect(previewStarted).toBe(true))
    useAppStore.setState({
      settings: { ...settings, activeRuntimeEnvironmentId: 'remote-fixture' }
    })
    await act(async () => releasePreview())
    await expect(switched).rejects.toThrow('plugin_marketplace_preview_failed_effect_unknown')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  } finally {
    releasePreview()
    nextPreview = undefined
    useAppStore.setState({ settings })
  }
  await invoke('preview', undefined, target)
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Fixture review')
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Requested access')
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('normal process')
  await expect(
    invoke('preview-close', undefined, { source, plugin: 'fixture.beta' })
  ).rejects.toThrow('plugin_marketplace_preview_target_mismatch')
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const install = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')
  ).find((button) => button.textContent === 'Install plugin')
  try {
    let sameTurnClose: Promise<PluginMarketplaceViewerState> | undefined
    await act(async () => {
      install?.click()
      sameTurnClose = requestPluginMarketplace(
        { action: 'preview-close', ...target },
        Date.now() + 3000
      )
      void sameTurnClose.catch(() => {})
    })
    await expect(sameTurnClose).rejects.toThrow('plugin_marketplace_preview_busy')
    await expect(invoke('preview-close', undefined, target)).rejects.toThrow(
      'plugin_marketplace_preview_busy'
    )
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    await act(async () => releaseInstall?.())
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
        'Could not install this plugin.'
      )
    )
  } finally {
    releaseInstall?.()
    releaseInstall = undefined
    warn.mockRestore()
  }
  await invoke('preview-close', undefined, target)
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  const installed: PluginHostListEntry = {
    pluginKey: target.plugin,
    consentFingerprint: valid.consentFingerprint,
    name: valid.manifest.name,
    version: valid.manifest.version,
    publisher: valid.manifest.publisher,
    status: 'idle',
    needsReconsent: false,
    isDev: false,
    official: false,
    bundled: false,
    capabilities: [],
    panels: [],
    commands: [],
    hasWorker: true,
    restarts: 0,
    source: {
      kind: 'marketplace',
      reference: valid.source.url,
      resolvedCommit: valid.resolvedCommit,
      contentHash: 'older-fixture-content',
      marketplace: {
        reference: 'https://example.invalid/catalog.git',
        resolvedCommit: valid.marketplaceCommit
      }
    }
  }
  const publishInstalled = async (entries: PluginHostListEntry[]): Promise<void> => {
    await act(async () => {
      installedPlugins = entries
      for (const listener of installedListeners) {
        listener()
      }
    })
  }
  try {
    await publishInstalled([installed])
    expect(
      document.querySelector('[data-marketplace-plugin-key="fixture.alpha"] button')?.textContent
    ).toContain('Check for update')
    await invoke('preview', undefined, target)
    expect(window.api.plugins.previewMarketplaceUpdate).toHaveBeenCalledExactlyOnceWith({
      pluginKey: target.plugin
    })
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Update plugin')
    expect(dialog?.textContent).toContain('Requested access')
    expect(dialog?.textContent).toContain('normal process')
    await invoke('preview-close', undefined, target)
    await publishInstalled([
      {
        ...installed,
        source: {
          kind: 'marketplace',
          reference: valid.source.url,
          resolvedCommit: valid.resolvedCommit,
          contentHash: 'older-fixture-content',
          marketplace: {
            reference: 'https://example.invalid/different-catalog.git',
            resolvedCommit: 'other-marketplace-commit'
          }
        }
      }
    ])
    nextPreview = async () => ({ ...valid, marketplaceSourceId: 'other-source' })
    await expect(invoke('preview', undefined, target)).rejects.toThrow(
      'plugin_marketplace_preview_failed_effect_unknown'
    )
    expect(window.api.plugins.previewMarketplaceUpdate).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  } finally {
    nextPreview = undefined
    await publishInstalled([])
  }
}
