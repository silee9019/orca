import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { applySettingsViewerRequest } from './settings-viewer-bridge'
import { publishSettingsViewerView, readSettingsViewerView } from './settings-viewer-view'

const store = vi.hoisted(() => {
  const settings: { activeRuntimeEnvironmentId: string | null } = {
    activeRuntimeEnvironmentId: null
  }
  return {
    state: {
      settings,
      persistedUIReady: true,
      activeView: 'terminal',
      settingsSearchQuery: '',
      settingsSearchInputQuery: '',
      repos: [],
      projects: [],
      projectHostSetups: [],
      openSettingsTarget: vi.fn(),
      openSettingsPage: vi.fn(),
      setSettingsSearchQuery: vi.fn()
    }
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => store.state } }))
vi.mock('@/store/selectors', () => ({
  getProjectHostSetupProjectionFromState: () => ({ projects: [], setups: [] })
}))

const catalog = () => ({
  sectionIds: ['general', 'git', 'terminal'],
  runtimeContextKey: getProviderRuntimeContextKey(store.state.settings)
})
const publish = (dirty = false, rendered = ['general'], navigationPending = false) =>
  publishSettingsViewerView({
    runtimeContextKey: catalog().runtimeContextKey,
    activeSectionId: 'general',
    queryInput: store.state.settingsSearchInputQuery,
    queryApplied: store.state.settingsSearchQuery,
    visibleSectionIds: ['general'],
    renderedSectionIds: rendered,
    renderedTargetIds: rendered,
    navigationPending,
    hasUnsavedChanges: dirty
  })
beforeEach(() => {
  vi.clearAllMocks()
  store.state.activeView = 'terminal'
  store.state.settings.activeRuntimeEnvironmentId = null
  store.state.settingsSearchQuery = ''
  store.state.settingsSearchInputQuery = ''
  publishSettingsViewerView(null)
  store.state.openSettingsPage.mockImplementation(() => {
    store.state.activeView = 'settings'
    store.state.settingsSearchQuery = ''
    store.state.settingsSearchInputQuery = ''
  })
  store.state.setSettingsSearchQuery.mockImplementation((query: string) => {
    store.state.settingsSearchInputQuery = query
  })
})
afterEach(() => {
  publishSettingsViewerView(null)
  vi.useRealTimers()
})

it('refuses a hidden pane and unsaved settings before changing navigation', async () => {
  await expect(
    applySettingsViewerRequest(
      {
        id: 'a',
        expiresAt: Date.now() + 9000,
        command: { viewer: 'host', operation: 'open', pane: 'chat' }
      },
      catalog()
    )
  ).rejects.toThrow('settings_pane_unavailable')
  store.state.activeView = 'settings'
  publish(true)
  await expect(
    applySettingsViewerRequest(
      {
        id: 'b',
        expiresAt: Date.now() + 9000,
        command: { viewer: 'host', operation: 'search', query: 'terminal' }
      },
      catalog()
    )
  ).rejects.toThrow('unsaved_settings_changes')
  expect(store.state.openSettingsPage).not.toHaveBeenCalled()
  expect(store.state.openSettingsTarget).not.toHaveBeenCalled()
  expect(store.state.setSettingsSearchQuery).not.toHaveBeenCalled()
})

it('waits for both the search input and its debounced rendered results', async () => {
  vi.useFakeTimers()
  let completed = false
  const result = applySettingsViewerRequest(
    {
      id: 'a',
      expiresAt: Date.now() + 9000,
      command: { viewer: 'host', operation: 'search', query: 'general' }
    },
    catalog()
  ).then((value) => {
    completed = true
    return value
  })
  publish()
  await vi.advanceTimersByTimeAsync(1)
  expect(completed).toBe(false)
  store.state.settingsSearchQuery = 'general'
  publish()
  expect(await result).toMatchObject({
    applied: true,
    queryInput: 'general',
    queryApplied: 'general',
    visibleSectionIds: ['general']
  })
  expect(store.state.openSettingsPage.mock.invocationCallOrder[0]).toBeLessThan(
    store.state.setSettingsSearchQuery.mock.invocationCallOrder[0] ?? 0
  )
})

it('does not equate a consumed deep link with a rendered pane', async () => {
  vi.useFakeTimers()
  const result = applySettingsViewerRequest(
    {
      id: 'a',
      expiresAt: Date.now() + 9000,
      command: { viewer: 'host', operation: 'open', pane: 'general' }
    },
    catalog()
  )
  publish(false, [])
  await vi.advanceTimersByTimeAsync(5000)
  expect(await result).toMatchObject({ applied: false, reason: 'settings_target_not_rendered' })
})

it('waits for refreshed results when the same search is requested again', async () => {
  vi.useFakeTimers()
  store.state.activeView = 'settings'
  store.state.settingsSearchInputQuery = 'general'
  store.state.settingsSearchQuery = 'general'
  publish()
  let completed = false
  const result = applySettingsViewerRequest(
    {
      id: 'repeat',
      expiresAt: Date.now() + 9000,
      command: { viewer: 'host', operation: 'search', query: 'general' }
    },
    catalog()
  ).then((value) => {
    completed = true
    return value
  })
  await vi.advanceTimersByTimeAsync(1)
  expect(completed).toBe(false)
  store.state.settingsSearchQuery = 'general'
  publish()
  expect(await result).toMatchObject({ applied: true, queryApplied: 'general' })
})

it('waits for the existing navigation and scroll frames to finish', async () => {
  vi.useFakeTimers()
  let completed = false
  const result = applySettingsViewerRequest(
    {
      id: 'pending',
      expiresAt: Date.now() + 9000,
      command: { viewer: 'host', operation: 'open', pane: 'general' }
    },
    catalog()
  ).then((value) => {
    completed = true
    return value
  })
  publish(false, ['general'], true)
  await vi.advanceTimersByTimeAsync(1)
  expect(completed).toBe(false)
  publish()
  expect(await result).toMatchObject({ applied: true, sectionTargetPresent: true })
})

it('does not acknowledge a pane superseded before the response', async () => {
  const result = applySettingsViewerRequest(
    {
      id: 'superseded',
      expiresAt: Date.now() + 9000,
      command: { viewer: 'host', operation: 'open', pane: 'general' }
    },
    catalog()
  )
  publish()
  const previous = readSettingsViewerView()
  if (!previous) {
    throw new Error('missing_fixture_view')
  }
  publishSettingsViewerView({
    ...previous,
    activeSectionId: 'git',
    renderedSectionIds: ['git'],
    renderedTargetIds: ['git']
  })
  expect(await result).toMatchObject({ applied: false, activeSectionId: 'git' })
})
