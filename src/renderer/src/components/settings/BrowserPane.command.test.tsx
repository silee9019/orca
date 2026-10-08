// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { BrowserPane } from './BrowserPane'
import { requestBrowserSettings } from '@/runtime/browser-settings-request'
import { act } from 'react'
import type * as BrowserSearch from './browser-search'

const fake = vi.hoisted(() => ({
  query: '',
  locale: { language: 'en' },
  translate: vi.fn((_key: string, fallback: string) => fallback),
  setHost: vi.fn(),
  profiles: [],
  repos: [],
  map: new Map(),
  environments: [],
  hostOptions: [{ id: 'local', kind: 'local', label: 'Local' }]
}))
vi.mock('@/i18n/i18n', () => ({ i18n: fake.locale, translate: fake.translate }))
vi.mock('./browser-search', async (importOriginal) => {
  const original = await importOriginal<typeof BrowserSearch>()
  return { ...original, getBrowserPaneSearchEntries: vi.fn(original.getBrowserPaneSearchEntries) }
})
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      settingsSearchQuery: fake.query,
      browserDefaultUrl: '',
      browserSessionProfiles: fake.profiles,
      repos: fake.repos,
      sshTargetLabels: fake.map,
      sshConnectionStates: fake.map,
      runtimeEnvironments: fake.environments,
      runtimeStatusByEnvironmentId: fake.map,
      browserSessionHostIdOverride: null,
      setBrowserSessionHostId: fake.setHost
    })
}))
vi.mock('@/components/terminal-pane/pane-helpers', () => ({ isMacUserAgent: () => false }))
vi.mock('../sidebar/sidebar-host-options', () => ({
  buildSidebarHostOptions: () => fake.hostOptions
}))
vi.mock('./BrowserHomePageSetting', () => ({
  BrowserHomePageSetting: ({
    value,
    onChange
  }: {
    value: string
    onChange: (value: string) => void
  }) => (
    <input
      aria-label="Home page draft"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}))
vi.mock('./BrowserUsePane', () => ({ BrowserUseSetup: () => <span>Browser use row</span> }))
vi.mock('./BrowserDefaultZoomSetting', () => ({
  BrowserDefaultZoomSetting: () => <span>Zoom row</span>
}))
vi.mock('./BrowserSearchEngineSetting', () => ({
  BrowserSearchEngineSetting: () => <span>Search row</span>
}))
vi.mock('./BrowserLinkRoutingSetting', () => ({
  BrowserLinkRoutingSetting: () => <span>Routing row</span>
}))
vi.mock('./BrowserLinkRoutingModifierSetting', () => ({
  BrowserLinkRoutingModifierSetting: () => <span>Modifier row</span>
}))
vi.mock('./BrowserTerminalLinkActionsSetting', () => ({
  BrowserTerminalLinkActionsSetting: () => <span>Terminal links row</span>
}))
vi.mock('./BrowserLocalhostWorktreeLabelsSetting', () => ({
  BrowserLocalhostWorktreeLabelsSetting: () => <span>Localhost row</span>
}))
vi.mock('./BrowserClientHostedRemoteSetting', () => ({
  BrowserClientHostedRemoteSetting: () => <span>Remote row</span>
}))
vi.mock('./BrowserSshWorkspaceRoutingSetting', () => ({
  BrowserSshWorkspaceRoutingSetting: () => <span>SSH row</span>
}))
vi.mock('./BrowserUserAgentSetting', () => ({
  BrowserUserAgentSetting: () => <span>Identity row</span>
}))
vi.mock('./SettingsFormControls', () => ({ SettingsSubsectionHeader: () => null }))
vi.mock('./BrowserSessionCookiesSection', () => ({
  BrowserSessionCookiesSection: () => <span>Cookies row</span>
}))
vi.mock('./BrowserNewProfileDialog', () => ({ BrowserNewProfileDialog: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
  fake.query = ''
})
afterEach(cleanup)
it('applies a request to the mounted home page draft without claiming persistence', async () => {
  render(<BrowserPane settings={getDefaultSettings('/synthetic')} updateSettings={vi.fn()} />)
  let pending: ReturnType<typeof requestBrowserSettings>
  await act(async () => {
    pending = requestBrowserSettings(
      { action: 'homepage-draft', value: 'https://draft.example' },
      Date.now() + 1500
    )
    void pending.catch(() => {})
    await Promise.resolve()
  })
  const result = await pending!
  expect(result.homePageDraftPresent).toBe(true)
  expect(result.homePageDraftSaved).toBe(false)
  expect(screen.getByRole('textbox')).toHaveProperty('value', 'https://draft.example')
})
