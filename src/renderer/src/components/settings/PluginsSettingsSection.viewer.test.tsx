// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PluginHostListEntry } from '../../../../preload/api-types'
import { getDefaultSettings } from '../../../../shared/constants'
import {
  PluginSettingsViewerActionSchema,
  type PluginSettingsViewerAction
} from '../../../../shared/plugin-settings-viewer-command'
import { applyPluginSettingsViewerAction } from '@/runtime/plugin-settings-viewer-controller'
import { PluginsSettingsSection } from './PluginsSettingsSection'

vi.mock('./SettingsSection', () => ({
  SettingsSection: ({
    children,
    headerAction
  }: {
    children: React.ReactNode
    headerAction: React.ReactNode
  }) => (
    <section>
      {headerAction}
      {children}
    </section>
  )
}))
vi.mock('./PluginMarketplaceBrowser', () => ({
  PluginMarketplaceBrowser: ({
    renderInstalledContent
  }: {
    renderInstalledContent?: (search: string) => React.ReactNode
  }) => <>{renderInstalledContent?.('')}</>
}))
const plugin: PluginHostListEntry = {
  pluginKey: 'fixture.notes',
  consentFingerprint: 'reviewed-notes',
  name: 'Notes',
  version: '1.0.0',
  publisher: 'fixture',
  status: 'idle',
  needsReconsent: false,
  isDev: false,
  official: false,
  bundled: false,
  capabilities: [],
  panels: [],
  commands: [],
  hasWorker: false,
  restarts: 0
}
const api = {
  list: vi.fn(),
  onChanged: vi.fn(() => () => undefined),
  refresh: vi.fn(),
  setEnabled: vi.fn(),
  getLogs: vi.fn(),
  remove: vi.fn(),
  consent: vi.fn(),
  install: vi.fn(),
  rollbackMarketplacePlugin: vi.fn()
}
beforeEach(() => {
  vi.clearAllMocks()
  api.list.mockResolvedValue([plugin])
  api.refresh.mockResolvedValue([plugin])
  api.setEnabled.mockResolvedValue([{ ...plugin, status: 'disabled' }])
  api.getLogs.mockResolvedValue([{ ts: 1, level: 'info', line: 'fixture log' }])
  Object.defineProperty(window, 'api', { configurable: true, value: { plugins: api } })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})
const settings = { ...getDefaultSettings('/fixture'), pluginSystemEnabled: true }
async function mount(mounted = true) {
  let view: ReturnType<typeof render> | undefined
  await act(async () => {
    view = render(
      <PluginsSettingsSection
        mounted={mounted}
        settings={settings}
        updateSettings={async () => undefined}
      />
    )
  })
  if (!view) {
    throw new Error('fixture not mounted')
  }
  return view
}
async function apply(action: PluginSettingsViewerAction) {
  let request: ReturnType<typeof applyPluginSettingsViewerAction> | undefined
  await act(async () => {
    request = applyPluginSettingsViewerAction(action)
    void request.catch(() => undefined)
  })
  return request
}
it('uses the mounted settings callbacks for toggle, lazy logs and refresh, then reports committed state', async () => {
  await mount()
  await expect(apply({ kind: 'get' })).resolves.toMatchObject({
    pluginKeys: [plugin.pluginKey],
    committed: true
  })
  expect(api.getLogs).not.toHaveBeenCalled()
  await expect(
    apply({ kind: 'logs', pluginKey: plugin.pluginKey, open: true })
  ).resolves.toMatchObject({
    openLogs: [plugin.pluginKey],
    logs: { [plugin.pluginKey]: { loading: false } }
  })
  expect(screen.getByText(/fixture log/)).toBeTruthy()
  await apply({ kind: 'logs', pluginKey: plugin.pluginKey, open: false })
  await apply({ kind: 'logs', pluginKey: plugin.pluginKey, open: true })
  expect(api.getLogs).toHaveBeenCalledExactlyOnceWith({ pluginKey: plugin.pluginKey })
  await expect(
    apply({ kind: 'toggle-enabled', pluginKey: plugin.pluginKey })
  ).resolves.toMatchObject({ plugins: [{ pluginKey: plugin.pluginKey, status: 'disabled' }] })
  expect(api.setEnabled).toHaveBeenCalledExactlyOnceWith({
    pluginKey: plugin.pluginKey,
    enabled: false
  })
  await apply({ kind: 'refresh' })
  expect(api.refresh).toHaveBeenCalledOnce()
})
it('opens the existing remove confirmation without removing and blocks a second modal', async () => {
  await mount()
  await expect(
    apply({ kind: 'open-plugin', dialog: 'remove', pluginKey: plugin.pluginKey })
  ).resolves.toMatchObject({ removePluginId: plugin.pluginKey })
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  expect(api.remove).not.toHaveBeenCalled()
  await expect(apply({ kind: 'open', dialog: 'install' })).rejects.toThrow('viewer_modal_open')
  await expect(
    apply({ kind: 'cancel', dialog: 'remove', pluginKey: 'fixture.other' })
  ).rejects.toThrow('plugin_confirmation_changed')
  await expect(
    apply({ kind: 'cancel', dialog: 'remove', pluginKey: plugin.pluginKey })
  ).resolves.toMatchObject({ removePluginId: null })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
it('rejects hidden panes, unloaded keys and plugins that require consent before any mutation', async () => {
  const view = await mount(false)
  await expect(applyPluginSettingsViewerAction({ kind: 'get' })).rejects.toThrow(
    'viewer_unavailable'
  )
  await act(async () => {
    view.unmount()
  })
  api.list.mockResolvedValue([{ ...plugin, status: 'pending', needsReconsent: true }])
  await mount()
  await expect(apply({ kind: 'toggle-enabled', pluginKey: plugin.pluginKey })).rejects.toThrow(
    'plugin_consent_required'
  )
  await expect(apply({ kind: 'logs', pluginKey: 'fixture.missing', open: true })).rejects.toThrow(
    'plugin_not_loaded'
  )
  expect(api.setEnabled).not.toHaveBeenCalled()
})

it('reports rejected mutations and log loads rather than acknowledging success', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  await mount()
  api.setEnabled.mockRejectedValueOnce(new Error('offline'))
  await expect(apply({ kind: 'toggle-enabled', pluginKey: plugin.pluginKey })).rejects.toThrow(
    'plugin_toggle_failed'
  )
  api.refresh.mockRejectedValueOnce(new Error('offline'))
  await expect(apply({ kind: 'refresh' })).rejects.toThrow('plugin_refresh_failed')
  await apply({ kind: 'refresh' })
  api.getLogs.mockRejectedValueOnce(new Error('offline'))
  await expect(apply({ kind: 'logs', pluginKey: plugin.pluginKey, open: true })).rejects.toThrow(
    'plugin_logs_failed'
  )
})
it('rejects concurrent actions and pending acknowledgements when the pane unmounts', async () => {
  let finish: (value: PluginHostListEntry[]) => void = () => undefined
  api.setEnabled.mockImplementationOnce(
    () =>
      new Promise<PluginHostListEntry[]>((resolve) => {
        finish = resolve
      })
  )
  const view = await mount()
  let request: ReturnType<typeof applyPluginSettingsViewerAction> | undefined
  await act(async () => {
    request = applyPluginSettingsViewerAction({
      kind: 'toggle-enabled',
      pluginKey: plugin.pluginKey
    })
    void request.catch(() => undefined)
  })
  await expect(applyPluginSettingsViewerAction({ kind: 'refresh' })).rejects.toThrow('viewer_busy')
  await act(async () => {
    view.unmount()
  })
  await expect(request).rejects.toThrow('viewer_unmounted')
  await act(async () => {
    finish([{ ...plugin, status: 'disabled' }])
  })
  await expect(applyPluginSettingsViewerAction({ kind: 'get' })).rejects.toThrow(
    'viewer_unavailable'
  )
})
it('refuses protected removal and rollback without an installed marketplace source', async () => {
  api.list.mockResolvedValue([{ ...plugin, bundled: true }])
  await mount()
  await expect(
    apply({ kind: 'open-plugin', dialog: 'remove', pluginKey: plugin.pluginKey })
  ).rejects.toThrow('plugin_remove_protected')
  await expect(
    apply({ kind: 'open-plugin', dialog: 'rollback', pluginKey: plugin.pluginKey })
  ).rejects.toThrow('plugin_rollback_unavailable')
  expect(api.remove).not.toHaveBeenCalled()
})

it('opens existing install and consent dialogs without installing or granting consent', async () => {
  const view = await mount()
  await expect(apply({ kind: 'open', dialog: 'install' })).resolves.toMatchObject({
    installOpen: true
  })
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(api.install).not.toHaveBeenCalled()
  await act(async () => {
    view.unmount()
  })
  api.list.mockResolvedValue([{ ...plugin, status: 'pending', needsReconsent: true }])
  await mount()
  await expect(
    apply({
      kind: 'open-plugin',
      dialog: 'review',
      pluginKey: plugin.pluginKey
    })
  ).resolves.toMatchObject({ consentPluginId: plugin.pluginKey })
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(api.consent).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep Disabled' }))
})

it('opens and cancels the existing rollback confirmation without mutating its installed version', async () => {
  const marketplacePlugin: PluginHostListEntry = {
    ...plugin,
    source: {
      kind: 'marketplace',
      reference: 'https://example.com/notes.git',
      resolvedCommit: 'current-commit',
      contentHash: 'current-content',
      marketplace: {
        reference: 'https://example.com/marketplace.git',
        resolvedCommit: 'marketplace-commit'
      }
    }
  }
  api.list.mockResolvedValue([marketplacePlugin])
  await mount()
  await expect(
    apply({
      kind: 'open-plugin',
      dialog: 'rollback',
      pluginKey: plugin.pluginKey
    })
  ).resolves.toMatchObject({ rollbackPluginId: plugin.pluginKey })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  await expect(
    apply({
      kind: 'cancel',
      dialog: 'rollback',
      pluginKey: plugin.pluginKey
    })
  ).resolves.toMatchObject({ rollbackPluginId: null })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(api.rollbackMarketplacePlugin).not.toHaveBeenCalled()
})

it.each(['remove', 'rollback'] as const)(
  'requires the displayed %s confirmation and reports its real completion',
  async (dialog) => {
    const installed: PluginHostListEntry = {
      ...plugin,
      source: {
        kind: 'marketplace',
        reference: 'https://example.com/notes.git',
        resolvedCommit: 'commit',
        contentHash: 'content',
        marketplace: { reference: 'https://example.com/catalog.git', resolvedCommit: 'catalog' }
      }
    }
    api.list.mockResolvedValue([installed])
    api.remove.mockResolvedValue([])
    api.rollbackMarketplacePlugin.mockResolvedValue({ ok: true })
    await mount()
    const confirm = (version = '1.0.0') =>
      PluginSettingsViewerActionSchema.parse({
        kind: 'confirm',
        dialog,
        pluginKey: plugin.pluginKey,
        version
      })
    await expect(apply(confirm())).rejects.toThrow('plugin_confirmation_changed')
    await apply({ kind: 'open-plugin', dialog, pluginKey: plugin.pluginKey })
    await expect(apply(confirm('2.0.0'))).rejects.toThrow('plugin_confirmation_changed')
    expect(api.remove).not.toHaveBeenCalled()
    expect(api.rollbackMarketplacePlugin).not.toHaveBeenCalled()
    const state = await apply(confirm())
    expect(state).toMatchObject({ removePluginId: null, rollbackPluginId: null })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(
      dialog === 'remove' ? api.remove : api.rollbackMarketplacePlugin
    ).toHaveBeenCalledExactlyOnceWith({ pluginKey: plugin.pluginKey })
  }
)

it('rejects concurrent confirmation and completion after the settings pane unmounts', async () => {
  let finish: (plugins: PluginHostListEntry[]) => void = () => undefined
  api.remove.mockImplementationOnce(
    () =>
      new Promise<PluginHostListEntry[]>((resolve) => {
        finish = resolve
      })
  )
  const view = await mount()
  await apply({ kind: 'open-plugin', dialog: 'remove', pluginKey: plugin.pluginKey })
  const action = PluginSettingsViewerActionSchema.parse({
    kind: 'confirm',
    dialog: 'remove',
    pluginKey: plugin.pluginKey,
    version: plugin.version
  })
  let request: ReturnType<typeof applyPluginSettingsViewerAction> | undefined
  await act(async () => {
    request = applyPluginSettingsViewerAction(action)
    void request.catch(() => undefined)
  })
  await expect(apply({ kind: 'get' })).resolves.toMatchObject({
    busyPluginKeys: [plugin.pluginKey],
    removePluginId: plugin.pluginKey
  })
  await expect(apply(action)).rejects.toThrow('viewer_busy')
  await act(async () => {
    view.unmount()
  })
  await expect(request).rejects.toThrow('viewer_unmounted')
  await act(async () => {
    finish([])
  })
  await expect(applyPluginSettingsViewerAction({ kind: 'get' })).rejects.toThrow(
    'viewer_unavailable'
  )
})

it('permits cancellation after a failed removal without invoking it again', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  api.remove.mockRejectedValueOnce(new Error('offline'))
  await mount()
  await apply({ kind: 'open-plugin', dialog: 'remove', pluginKey: plugin.pluginKey })
  await expect(
    apply(
      PluginSettingsViewerActionSchema.parse({
        kind: 'confirm',
        dialog: 'remove',
        pluginKey: plugin.pluginKey,
        version: plugin.version
      })
    )
  ).rejects.toThrow('plugin_confirmation_failed')
  await expect(
    apply({ kind: 'cancel', dialog: 'remove', pluginKey: plugin.pluginKey })
  ).resolves.toMatchObject({ removePluginId: null })
  expect(api.remove).toHaveBeenCalledTimes(1)
})
it.each(['remove', 'rollback'] as const)(
  'keeps a failed %s confirmation open and permits an explicit retry',
  async (dialog) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    api.list.mockResolvedValue([
      {
        ...plugin,
        source: {
          kind: 'marketplace',
          reference: 'https://example.com/notes.git',
          resolvedCommit: 'commit',
          contentHash: 'content',
          marketplace: { reference: 'https://example.com/catalog.git', resolvedCommit: 'catalog' }
        }
      }
    ])
    const operation = dialog === 'remove' ? api.remove : api.rollbackMarketplacePlugin
    operation.mockRejectedValueOnce(new Error('offline'))
    operation.mockResolvedValueOnce(dialog === 'remove' ? [] : { ok: true })
    await mount()
    await apply({ kind: 'open-plugin', dialog, pluginKey: plugin.pluginKey })
    const action = PluginSettingsViewerActionSchema.parse({
      kind: 'confirm',
      dialog,
      pluginKey: plugin.pluginKey,
      version: '1.0.0'
    })
    await expect(apply(action)).rejects.toThrow('plugin_confirmation_failed')
    expect(screen.getByRole('dialog')).toBeTruthy()
    await expect(apply(action)).resolves.toMatchObject({
      removePluginId: null,
      rollbackPluginId: null
    })
    expect(operation).toHaveBeenCalledTimes(2)
  }
)
