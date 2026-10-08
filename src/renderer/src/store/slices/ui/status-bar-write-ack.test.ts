import { afterEach, expect, it, vi } from 'vitest'
import { createUIStore, makePersistedUI } from '../ui-slice-test-harness'
import { getDefaultSettings } from '../../../../../shared/constants'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('returns the original failed status bar write without losing the parent fields', async () => {
  const failure = new Error('write_rejected')
  const setWithAck = vi.fn(async () => {
    throw failure
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('window', { api: { ui: { setWithAck, set: vi.fn(async () => {}) } } })
  const store = createUIStore()
  store.setState({ statusBarItems: ['ports'] })
  await expect(store.getState().setStatusBarVisible(false)).rejects.toBe(failure)
  await expect(store.getState().toggleStatusBarItem('ports')).rejects.toBe(failure)
  await expect(store.getState().setUsagePercentageDisplay('remaining')).rejects.toBe(failure)
  expect(setWithAck).toHaveBeenCalledWith({ statusBarVisible: false })
  expect(setWithAck).toHaveBeenCalledWith({ statusBarItems: expect.not.arrayContaining(['ports']) })
  expect(setWithAck).toHaveBeenCalledWith({
    usagePercentageDisplay: 'remaining',
    usagePercentageDisplayChangeNoticeDismissed: true
  })
})

it('exposes a feature write failure while keeping the optimistic count', async () => {
  const failure = new Error('interaction_rejected')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('window', {
    api: {
      ui: {
        recordFeatureInteraction: vi.fn(async () => {
          throw failure
        })
      }
    }
  })
  const store = createUIStore()
  store.setState({ persistedUIReady: true, featureInteractions: {} })
  await expect(store.getState().recordFeatureInteraction('ports')).rejects.toBe(failure)
  expect(store.getState().featureInteractions.ports?.interactionCount).toBe(1)
})

it('does not merge a late feature response into another runtime', async () => {
  const response = Promise.withResolvers<ReturnType<typeof makePersistedUI>>()
  vi.stubGlobal('window', {
    api: { ui: { recordFeatureInteraction: vi.fn(() => response.promise) } }
  })
  const store = createUIStore()
  const settings = getDefaultSettings('/fixture')
  store.setState({ settings, persistedUIReady: true, featureInteractions: {} })
  const saving = store.getState().recordFeatureInteraction('ports')
  store.setState({
    settings: { ...settings, activeRuntimeEnvironmentId: 'another-host' },
    featureInteractions: {}
  })
  response.resolve(
    makePersistedUI({
      featureInteractions: { ports: { firstInteractedAt: 10, interactionCount: 12 } }
    })
  )
  await saving
  expect(store.getState().featureInteractions).toEqual({})
})
