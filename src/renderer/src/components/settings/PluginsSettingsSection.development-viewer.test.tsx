// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { PluginSettingsViewerActionSchema } from '../../../../shared/plugin-settings-viewer-command'
import { applyPluginSettingsViewerAction } from '@/runtime/plugin-settings-viewer-controller'
import { PluginsSettingsSection } from './PluginsSettingsSection'

vi.mock('./SettingsSection', () => ({
  SettingsSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>
}))
vi.mock('./PluginMarketplaceBrowser', () => ({ PluginMarketplaceBrowser: () => null }))
const updateSettings = vi.fn()
const api = { list: vi.fn(), onChanged: vi.fn(() => () => undefined), refresh: vi.fn() }
beforeEach(() => {
  vi.clearAllMocks()
  api.list.mockResolvedValue([])
  api.refresh.mockResolvedValue([])
  Object.defineProperty(window, 'api', { configurable: true, value: { plugins: api } })
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'api')
})
async function mount(enabled = true) {
  await act(async () => {
    render(
      <PluginsSettingsSection
        mounted
        settings={{ ...getDefaultSettings('/fixture'), pluginSystemEnabled: enabled }}
        updateSettings={updateSettings}
      />
    )
  })
}
async function apply(action: unknown) {
  let request: ReturnType<typeof applyPluginSettingsViewerAction> | undefined
  await act(async () => {
    request = applyPluginSettingsViewerAction(
      PluginSettingsViewerActionSchema.parse({ kind: 'development-form', action })
    )
    void request.catch(() => undefined)
  })
  return request
}
it('stages the actual development input only after expanding its native details without saving settings', async () => {
  await mount()
  await expect(apply({ kind: 'get' })).resolves.toMatchObject({
    development: { pathInput: '', expanded: false }
  })
  await expect(apply({ kind: 'input', value: '/fixture/notes' })).rejects.toThrow(
    'plugin_development_collapsed'
  )
  await apply({ kind: 'expanded', value: true })
  const value = 'C:\\plugins\\notes'
  await expect(apply({ kind: 'input', value })).resolves.toMatchObject({
    development: { pathInput: value, expanded: true }
  })
  expect(document.querySelector<HTMLInputElement>('#plugin-development-path')?.value).toBe(value)
  expect(document.querySelector('details')?.open).toBe(true)
  await apply({ kind: 'input', value })
  await expect(apply({ kind: 'expanded', value: false })).resolves.toMatchObject({
    development: { pathInput: value, expanded: false }
  })
  expect(document.querySelector('details')?.open).toBe(false)
  expect(updateSettings).not.toHaveBeenCalled()
  expect(api.refresh).not.toHaveBeenCalled()
})
it('does not target a development section hidden by the feature flag', async () => {
  await mount(false)
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
  await expect(apply({ kind: 'expanded', value: true })).rejects.toThrow('plugin_system_disabled')
  expect(updateSettings).not.toHaveBeenCalled()
})
it('rejects ambiguous settings panes before touching either input', async () => {
  await mount()
  await mount()
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_ambiguous')
  expect(updateSettings).not.toHaveBeenCalled()
})
