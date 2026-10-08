// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PluginHostListEntry } from '../../../../preload/api-types'
import { getDefaultSettings } from '../../../../shared/constants'
import { PluginSettingsViewerActionSchema } from '../../../../shared/plugin-settings-viewer-command'
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
  status: 'pending',
  needsReconsent: true,
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
  consent: vi.fn(),
  install: vi.fn(),
  refresh: vi.fn()
}
beforeEach(() => {
  vi.clearAllMocks()
  api.list.mockResolvedValue([])
  api.refresh.mockResolvedValue([plugin])
  api.install.mockReset().mockResolvedValue({ ok: true, pluginKey: plugin.pluginKey })
  api.consent.mockReset().mockResolvedValue([{ ...plugin, status: 'idle', needsReconsent: false }])
  Object.defineProperty(window, 'api', { configurable: true, value: { plugins: api } })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})
async function apply(action: unknown) {
  let request: ReturnType<typeof applyPluginSettingsViewerAction> | undefined
  await act(async () => {
    request = applyPluginSettingsViewerAction(PluginSettingsViewerActionSchema.parse(action))
    void request.catch(() => undefined)
  })
  return request
}
async function mountInstall() {
  let view: ReturnType<typeof render> | undefined
  await act(async () => {
    view = render(
      <PluginsSettingsSection
        mounted
        settings={{ ...getDefaultSettings('/fixture'), pluginSystemEnabled: true }}
        updateSettings={async () => undefined}
      />
    )
  })
  if (!view) {
    throw new Error('fixture not mounted')
  }
  await apply({ kind: 'open', dialog: 'install' })
  return view
}

const form = (action: unknown) => ({ kind: 'install-form', action })
it('preserves Windows path input on failure, retries the existing installer, and opens consent without approving it', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  await mountInstall()
  await expect(apply(form({ kind: 'get' }))).resolves.toMatchObject({
    install: { sourceKind: 'local-path', localPath: '', installing: false }
  })
  await apply(form({ kind: 'local-path', value: 'C:\\plugins\\notes' }))
  api.install.mockResolvedValueOnce({ ok: false, error: 'invalid manifest' })
  await expect(apply(form({ kind: 'submit' }))).rejects.toThrow('plugin_install_failed')
  await expect(apply(form({ kind: 'get' }))).resolves.toMatchObject({
    install: { localPath: 'C:\\plugins\\notes', error: expect.any(String) },
    installOpen: true
  })
  await expect(apply(form({ kind: 'submit' }))).resolves.toMatchObject({
    installOpen: false,
    consentPluginId: plugin.pluginKey,
    install: { accepted: true }
  })
  expect(api.install).toHaveBeenLastCalledWith({ kind: 'local-path', path: 'C:\\plugins\\notes' })
  expect(api.consent).not.toHaveBeenCalled()
})
it('requires a pinned safe Git URL before invoking the existing installer and preserves both input modes', async () => {
  await mountInstall()
  await apply(form({ kind: 'local-path', value: '/fixture/notes' }))
  await apply(form({ kind: 'source-kind', value: 'git' }))
  await apply(form({ kind: 'git-url', value: 'ext::arbitrary#main' }))
  await expect(apply(form({ kind: 'submit' }))).rejects.toThrow('plugin_install_failed')
  expect(api.install).not.toHaveBeenCalled()
  await apply(form({ kind: 'git-url', value: 'https://git.example/notes' }))
  await expect(apply(form({ kind: 'submit' }))).rejects.toThrow('plugin_install_failed')
  expect(api.install).not.toHaveBeenCalled()
  await apply(form({ kind: 'git-url', value: 'ssh://git@git.example/notes#v1.0.0' }))
  await expect(apply(form({ kind: 'get' }))).resolves.toMatchObject({
    install: { sourceKind: 'git', localPath: '/fixture/notes', gitUrlSet: true }
  })
  await apply(form({ kind: 'submit' }))
  expect(api.install).toHaveBeenCalledExactlyOnceWith({
    kind: 'git',
    url: 'ssh://git@git.example/notes',
    ref: 'v1.0.0'
  })
  expect(api.consent).not.toHaveBeenCalled()
})
it('exposes installation progress, refuses changes and close while busy, and rejects completion after pane unmount', async () => {
  let finish: (result: { ok: true; pluginKey: string }) => void = () => undefined
  api.install.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const view = await mountInstall()
  await apply(form({ kind: 'local-path', value: '/fixture/notes' }))
  let request: ReturnType<typeof applyPluginSettingsViewerAction> | undefined
  await act(async () => {
    request = applyPluginSettingsViewerAction(
      PluginSettingsViewerActionSchema.parse(form({ kind: 'submit' }))
    )
    void request.catch(() => undefined)
  })
  await expect(apply(form({ kind: 'get' }))).resolves.toMatchObject({
    install: { installing: true }
  })
  await expect(apply(form({ kind: 'close' }))).rejects.toThrow('viewer_busy')
  await expect(apply(form({ kind: 'local-path', value: '/other' }))).rejects.toThrow('viewer_busy')
  await act(async () => {
    view.unmount()
  })
  await expect(request).rejects.toThrow('viewer_unmounted')
  await act(async () => {
    finish({ ok: true, pluginKey: plugin.pluginKey })
  })
  await expect(applyPluginSettingsViewerAction({ kind: 'get' })).rejects.toThrow(
    'viewer_unavailable'
  )
})
it('closes only the existing installation dialog without a backend mutation', async () => {
  await mountInstall()
  await expect(apply(form({ kind: 'close' }))).resolves.toMatchObject({ installOpen: false })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(api.install).not.toHaveBeenCalled()
})

it('does not echo private Git URL contents in viewer snapshots', async () => {
  await mountInstall()
  await apply(form({ kind: 'source-kind', value: 'git' }))
  const value = 'https://fixture-user:fixture-secret@git.example/notes?token=fixture-token#main'
  const changedState = await apply(form({ kind: 'git-url', value }))
  const state = await apply(form({ kind: 'get' }))
  expect(JSON.stringify([changedState, state])).not.toContain('fixture-secret')
  expect(JSON.stringify([changedState, state])).not.toContain('fixture-token')
  expect(document.querySelector<HTMLInputElement>('#plugin-git-url')?.value).toBe(value)
  expect(api.install).not.toHaveBeenCalled()
})

it('redacts failed installation details in the existing warning and viewer error', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  await mountInstall()
  await apply(form({ kind: 'local-path', value: '/fixture/notes' }))
  api.install.mockRejectedValueOnce(
    new Error('fetch https://fixture-user:fixture-secret@git.example/notes?token=fixture-token')
  )
  await expect(apply(form({ kind: 'submit' }))).rejects.toThrow('plugin_install_failed')
  const state = await apply(form({ kind: 'get' }))
  expect(warn).toHaveBeenCalledOnce()
  expect(String(warn.mock.calls)).not.toContain('fixture-secret')
  expect(String(warn.mock.calls)).not.toContain('fixture-token')
  expect(JSON.stringify(state)).not.toContain('fixture-secret')
})
