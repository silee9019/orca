// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { PluginSettingsViewerActionSchema } from '../../../../shared/plugin-settings-viewer-command'
import { applyPluginSettingsViewerAction } from '@/runtime/plugin-settings-viewer-controller'
import { PluginsSettingsSection } from './PluginsSettingsSection'

vi.mock('./SettingsSection', () => ({
  SettingsSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>
}))
const source = {
  id: 'a'.repeat(32),
  source: { kind: 'git' as const, url: 'git@example.com:team/plugins.git', ref: 'stable' },
  addedAt: 1,
  marketplace: { name: 'Team', owner: 'example', resolvedCommit: 'b'.repeat(40), fetchedAt: 2 },
  stale: false,
  official: false
}
const listing = {
  marketplaceSourceId: source.id,
  marketplaceName: 'Team',
  marketplaceOwner: 'example',
  marketplaceCommit: 'b'.repeat(40),
  pluginKey: 'example.notes',
  source: { kind: 'git' as const, url: 'git@example.com:private/notes.git', ref: 'release' },
  description: 'Notes for active worktrees.',
  categories: ['productivity'],
  official: false,
  bundled: false
}
const preview = {
  ...listing,
  resolvedCommit: 'c'.repeat(40),
  contentHash: 'sha256-content',
  consentFingerprint: 'sha256-consent',
  manifest: {
    manifestVersion: 1 as const,
    id: 'notes',
    publisher: 'example',
    name: 'Worktree Notes',
    version: '1.0.0',
    description: 'Notes for active worktrees.',
    engines: { orca: '>=1.0.0' },
    pluginApi: 1 as const,
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
    capabilities: [{ kind: 'workspace:read' as const }]
  }
}
const reviewed = {
  kind: 'confirm',
  marketplaceSourceId: source.id,
  marketplaceCommit: preview.marketplaceCommit,
  pluginKey: preview.pluginKey,
  resolvedCommit: preview.resolvedCommit,
  contentHash: preview.contentHash
}
const openPreview = () =>
  apply({ kind: 'preview', marketplaceSourceId: source.id, pluginKey: listing.pluginKey })
const previewForm = (action: unknown) => apply({ kind: 'preview-form', action })

const api = {
  previewMarketplacePlugin: vi.fn(),
  previewMarketplaceUpdate: vi.fn(),
  installMarketplacePlugin: vi.fn(),
  consent: vi.fn(),
  list: vi.fn(),
  onChanged: vi.fn(() => () => undefined),
  refresh: vi.fn(),
  listMarketplaces: vi.fn(),
  listMarketplacePlugins: vi.fn(),
  addMarketplace: vi.fn(),
  refreshMarketplaces: vi.fn(),
  removeMarketplace: vi.fn()
}
beforeEach(() => {
  vi.clearAllMocks()
  api.previewMarketplacePlugin.mockResolvedValue(preview)
  api.previewMarketplaceUpdate.mockResolvedValue(preview)
  api.installMarketplacePlugin.mockResolvedValue({
    ok: true,
    pluginKey: preview.pluginKey,
    version: preview.manifest.version,
    contentHash: preview.contentHash,
    consentFingerprint: preview.consentFingerprint,
    resolvedCommit: preview.resolvedCommit
  })
  api.list.mockResolvedValue([])
  api.listMarketplaces.mockResolvedValue([source])
  api.listMarketplacePlugins.mockResolvedValue([])
  api.addMarketplace.mockResolvedValue(source)
  api.refreshMarketplaces.mockResolvedValue([source])
  api.removeMarketplace.mockResolvedValue([])
  Object.defineProperty(window, 'api', { configurable: true, value: { plugins: api } })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})
async function mount() {
  await act(async () => {
    render(
      <PluginsSettingsSection
        mounted
        settings={{ ...getDefaultSettings('/fixture'), pluginSystemEnabled: true }}
        updateSettings={vi.fn()}
      />
    )
  })
}
async function apply(action: unknown) {
  let request: ReturnType<typeof applyPluginSettingsViewerAction> | undefined
  await act(async () => {
    request = applyPluginSettingsViewerAction(
      PluginSettingsViewerActionSchema.parse({ kind: 'marketplace-form', action })
    )
    void request.catch(() => undefined)
  })
  return request
}
const form = (action: unknown) => apply({ kind: 'source-form', action })
it('uses the actual source inputs and callbacks without returning a private URL', async () => {
  await mount()
  await expect(form({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
  await apply({ kind: 'open-sources' })
  await form({ kind: 'focus-url' })
  expect(document.activeElement?.id).toBe('plugin-marketplace-url')
  const value = 'https://fixture-user:fixture-secret@example.com/private.git'
  const state = await form({ kind: 'url', value })
  expect(JSON.stringify(state)).not.toContain('fixture-secret')
  expect(document.querySelector<HTMLInputElement>('#plugin-marketplace-url')?.value).toBe(value)
  await form({ kind: 'ref', value: 'release' })
  await expect(form({ kind: 'add' })).resolves.toMatchObject({
    marketplace: { source: { urlSet: false, gitRef: 'main' } }
  })
  expect(api.addMarketplace).toHaveBeenCalledWith({ kind: 'git', url: value, ref: 'release' })
  await form({ kind: 'refresh', sourceId: source.id })
  await form({ kind: 'remove', sourceId: source.id })
  expect(api.refreshMarketplaces).toHaveBeenCalledWith({ sourceId: source.id })
  expect(api.removeMarketplace).toHaveBeenCalledWith({ sourceId: source.id })
  await form({ kind: 'close' })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
it('preserves failed input for retry and keeps private errors out of the existing warning', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  await mount()
  await apply({ kind: 'open-sources' })
  await expect(form({ kind: 'add' })).rejects.toThrow('plugin_marketplace_source_input_required')
  await form({ kind: 'url', value: 'git@example.com:private/plugins.git' })
  api.addMarketplace.mockRejectedValueOnce(new Error('fixture-secret'))
  await expect(form({ kind: 'add' })).rejects.toThrow('plugin_marketplace_source_failed')
  expect(warning.mock.calls.flat().map(String).join('\n')).not.toContain('fixture-secret')
  await expect(form({ kind: 'get' })).resolves.toMatchObject({
    marketplace: { source: { urlSet: true, error: expect.any(String) } }
  })
  await form({ kind: 'add' })
  expect(api.addMarketplace).toHaveBeenCalledTimes(2)
})
it('rejects unknown and official sources without issuing writes', async () => {
  api.listMarketplaces.mockResolvedValue([{ ...source, official: true }])
  await mount()
  await apply({ kind: 'open-sources' })
  await expect(form({ kind: 'remove', sourceId: source.id })).rejects.toThrow(
    'plugin_marketplace_source_protected'
  )
  await expect(form({ kind: 'refresh', sourceId: 'f'.repeat(32) })).rejects.toThrow(
    'plugin_marketplace_source_not_loaded'
  )
  expect(api.removeMarketplace).not.toHaveBeenCalled()
  expect(api.refreshMarketplaces).not.toHaveBeenCalled()
})
it('exposes busy state, blocks concurrent closing, and rejects pending requests on pane unmount', async () => {
  let finish: (() => void) | undefined
  api.refreshMarketplaces.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve
    })
  )
  await mount()
  await apply({ kind: 'open-sources' })
  let pending: ReturnType<typeof applyPluginSettingsViewerAction> | undefined
  await act(async () => {
    pending = applyPluginSettingsViewerAction(
      PluginSettingsViewerActionSchema.parse({
        kind: 'marketplace-form',
        action: { kind: 'source-form', action: { kind: 'refresh', sourceId: source.id } }
      })
    )
    void pending.catch(() => undefined)
  })
  await expect(form({ kind: 'get' })).resolves.toMatchObject({
    marketplace: { source: { busyAction: `refresh:${source.id}` } }
  })
  await expect(form({ kind: 'close' })).rejects.toThrow('viewer_busy')
  await act(async () => cleanup())
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await act(async () => finish?.())
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
})

it('does not log a raw backend error from the actual source dialog', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  api.addMarketplace.mockRejectedValueOnce(new Error('fixture-secret'))
  await mount()
  await act(async () => screen.getByRole('button', { name: 'Manage sources' }).click())
  fireEvent.change(screen.getByLabelText('Git URL'), {
    target: { value: 'git@example.com:private/plugins.git' }
  })
  await act(async () => screen.getByRole('button', { name: 'Add source' }).click())
  expect(api.addMarketplace).toHaveBeenCalledOnce()
  expect(warning.mock.calls.flat().map(String).join('\n')).not.toContain('fixture-secret')
})

it('commits the actual catalog filter and search and blocks root mutations behind the source dialog', async () => {
  await mount()
  await expect(apply({ kind: 'filter', value: 'installed' })).resolves.toMatchObject({
    marketplace: { filter: 'installed' }
  })
  expect(screen.getByRole('tab', { name: /Installed/ }).getAttribute('data-state')).toBe('active')
  await apply({ kind: 'query', value: 'private notes' })
  expect(screen.getByRole('textbox', { name: 'Search plugins' })).toHaveProperty(
    'value',
    'private notes'
  )
  await apply({ kind: 'query', value: 'private notes' })
  await apply({ kind: 'filter', value: 'all' })
  await apply({ kind: 'open-sources' })
  await expect(apply({ kind: 'filter', value: 'installed' })).rejects.toThrow('viewer_modal_open')
  await expect(applyPluginSettingsViewerAction({ kind: 'refresh' })).rejects.toThrow(
    'viewer_modal_open'
  )
  await form({ kind: 'close' })
  await expect(apply({ kind: 'filter', value: 'installed' })).resolves.toMatchObject({
    marketplace: { filter: 'installed' }
  })
})

async function mountPreview() {
  api.listMarketplacePlugins.mockResolvedValue([listing])
  await mount()
}
it('requires exact reviewed commits before installation and closes only the actual preview', async () => {
  await mountPreview()
  await expect(previewForm({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
  await openPreview()
  expect(api.previewMarketplacePlugin).toHaveBeenCalledWith({
    marketplaceSourceId: source.id,
    pluginKey: listing.pluginKey
  })
  expect(document.body.textContent).toContain('Worktree Notes')
  expect(document.body.textContent).toContain('full access to your files, network')
  const state = await previewForm({ kind: 'get' })
  expect(JSON.stringify(state)).not.toContain('private/notes.git')
  for (const changed of [
    { ...reviewed, resolvedCommit: 'd'.repeat(40) },
    { ...reviewed, marketplaceCommit: 'd'.repeat(40) },
    { ...reviewed, marketplaceSourceId: 'd'.repeat(32) },
    { ...reviewed, pluginKey: 'example.other' },
    { ...reviewed, contentHash: 'different-content' }
  ]) {
    await expect(previewForm(changed)).rejects.toThrow('plugin_marketplace_preview_changed')
  }
  expect(api.installMarketplacePlugin).not.toHaveBeenCalled()
  await previewForm(reviewed)
  expect(api.installMarketplacePlugin).toHaveBeenCalledExactlyOnceWith({
    marketplaceSourceId: source.id,
    marketplaceCommit: reviewed.marketplaceCommit,
    pluginKey: listing.pluginKey,
    resolvedCommit: reviewed.resolvedCommit
  })
  expect(api.consent).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
it('keeps failed review open for retry and allows cancellation', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  api.installMarketplacePlugin.mockResolvedValueOnce({ ok: false, error: 'fixture-secret' })
  await mountPreview()
  await openPreview()
  await expect(previewForm(reviewed)).rejects.toThrow('plugin_marketplace_install_failed')
  expect(warning.mock.calls.flat().map(String).join('\n')).not.toContain('fixture-secret')
  await expect(previewForm({ kind: 'get' })).resolves.toMatchObject({
    marketplace: { preview: { error: expect.any(String) } }
  })
  await previewForm(reviewed)
  expect(api.installMarketplacePlugin).toHaveBeenCalledTimes(2)
  await openPreview()
  await previewForm({ kind: 'close' })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
it('requires a visible exact source and listing and applies the safety list before fetching', async () => {
  await mountPreview()
  await expect(
    apply({ kind: 'preview', marketplaceSourceId: 'f'.repeat(32), pluginKey: listing.pluginKey })
  ).rejects.toThrow('plugin_marketplace_listing_not_visible')
  await apply({ kind: 'query', value: 'no matching listing' })
  await expect(openPreview()).rejects.toThrow('plugin_marketplace_listing_not_visible')
  await apply({ kind: 'query', value: '' })
  await apply({ kind: 'filter', value: 'installed' })
  await expect(openPreview()).rejects.toThrow('plugin_marketplace_listing_not_visible')
  expect(api.previewMarketplacePlugin).not.toHaveBeenCalled()
})

it('blocks safety-list and already-installed previews while keeping cancellation available', async () => {
  api.previewMarketplacePlugin.mockResolvedValue({
    ...preview,
    blockedByKillList: { reason: 'revoked' }
  })
  await mountPreview()
  await openPreview()
  await expect(previewForm(reviewed)).rejects.toThrow('plugin_marketplace_install_unavailable')
  expect(api.installMarketplacePlugin).not.toHaveBeenCalled()
  await previewForm({ kind: 'close' })
  await act(async () => cleanup())
  api.list.mockResolvedValue([installedPlugin(preview.contentHash)])
  api.previewMarketplacePlugin.mockResolvedValue(preview)
  await mountPreview()
  await openPreview()
  expect(api.previewMarketplaceUpdate).toHaveBeenCalledWith({ pluginKey: listing.pluginKey })
  await expect(previewForm(reviewed)).rejects.toThrow('plugin_marketplace_install_unavailable')
  await previewForm({ kind: 'close' })
  expect(api.installMarketplacePlugin).not.toHaveBeenCalled()
})
function installedPlugin(contentHash = 'old-content') {
  return {
    pluginKey: listing.pluginKey,
    consentFingerprint: preview.consentFingerprint,
    name: preview.manifest.name,
    version: preview.manifest.version,
    publisher: 'example',
    status: 'idle' as const,
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
      kind: 'marketplace' as const,
      reference: listing.source.url,
      resolvedCommit: preview.resolvedCommit,
      contentHash,
      marketplace: { reference: source.source.url, resolvedCommit: preview.marketplaceCommit }
    }
  }
}
it('opens the actual consent review after installation without approving it', async () => {
  await mountPreview()
  await openPreview()
  api.list.mockResolvedValue([{ ...installedPlugin(), status: 'pending', needsReconsent: true }])
  await expect(previewForm(reviewed)).resolves.toMatchObject({
    consentPluginId: listing.pluginKey,
    marketplace: { preview: { accepted: true } }
  })
  expect(api.consent).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
})
it('exposes pending install state and rejects a pending request when its pane unmounts', async () => {
  let finish: ((value: unknown) => void) | undefined
  api.installMarketplacePlugin.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  await mountPreview()
  await openPreview()
  let pending: ReturnType<typeof applyPluginSettingsViewerAction> | undefined
  await act(async () => {
    pending = applyPluginSettingsViewerAction(
      PluginSettingsViewerActionSchema.parse({
        kind: 'marketplace-form',
        action: { kind: 'preview-form', action: reviewed }
      })
    )
    void pending.catch(() => undefined)
  })
  await expect(previewForm({ kind: 'get' })).resolves.toMatchObject({
    marketplace: { preview: { busy: true } }
  })
  await expect(previewForm({ kind: 'close' })).rejects.toThrow('viewer_busy')
  await act(async () => cleanup())
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await act(async () => finish?.({ ok: true, pluginKey: preview.pluginKey }))
})
it('does not log a raw error from the actual preview confirmation', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  api.installMarketplacePlugin.mockResolvedValueOnce({ ok: false, error: 'fixture-secret' })
  await mountPreview()
  await act(async () => screen.getByRole('button', { name: 'Install' }).click())
  await act(async () => screen.getByRole('button', { name: 'Install plugin' }).click())
  expect(api.installMarketplacePlugin).toHaveBeenCalledOnce()
  expect(warning.mock.calls.flat().map(String).join('\n')).not.toContain('fixture-secret')
})

it('rejects blocked, ambiguous, and non-marketplace installed listings before fetching', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  api.listMarketplacePlugins.mockResolvedValue([
    { ...listing, blockedByKillList: { reason: 'revoked' } }
  ])
  await mount()
  await expect(openPreview()).rejects.toThrow('plugin_marketplace_preview_unavailable')
  await act(async () => cleanup())
  api.listMarketplacePlugins.mockResolvedValue([listing, listing])
  await mount()
  await expect(openPreview()).rejects.toThrow('viewer_ambiguous')
  await act(async () => cleanup())
  api.listMarketplacePlugins.mockResolvedValue([listing])
  api.list.mockResolvedValue([
    {
      ...installedPlugin(),
      source: {
        kind: 'git',
        reference: listing.source.url,
        resolvedCommit: preview.resolvedCommit,
        contentHash: 'old-content'
      }
    }
  ])
  await mount()
  await expect(openPreview()).rejects.toThrow('plugin_marketplace_preview_unavailable')
  expect(api.previewMarketplacePlugin).not.toHaveBeenCalled()
  expect(api.previewMarketplaceUpdate).not.toHaveBeenCalled()
})
