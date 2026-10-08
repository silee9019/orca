import { afterEach, expect, it, vi } from 'vitest'
import { createUIStore } from '../ui-slice-test-harness'
import { getDefaultSettings } from '../../../../../shared/constants'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('returns grouping failure and resets collapse even when the mode is unchanged', async () => {
  const failure = new Error('rejected')
  const setWithAck = vi.fn(async () => {
    throw failure
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('window', { api: { ui: { setWithAck, set: vi.fn(async () => {}) } } })
  const store = createUIStore()
  store.setState({
    settings: getDefaultSettings('/fixture'),
    persistedUIReady: true,
    groupBy: 'repo',
    collapsedGroups: new Set(['repo:one'])
  })
  await expect(store.getState().setGroupBy('repo')).rejects.toBe(failure)
  expect(setWithAck).toHaveBeenCalledTimes(1)
  expect(setWithAck).toHaveBeenCalledWith({ groupBy: 'repo', collapsedGroups: [] })
  expect([...store.getState().collapsedGroups]).toEqual([])
  expect(store.getState().persistedUIWriteInFlightCounts.groupBy ?? 0).toBe(0)
})
it('returns the original grouping Promise without overwriting a later edit', async () => {
  const saving = Promise.withResolvers<void>()
  vi.stubGlobal('window', {
    api: { ui: { setWithAck: vi.fn(() => saving.promise), set: vi.fn(async () => {}) } }
  })
  const store = createUIStore()
  const settings = getDefaultSettings('/fixture')
  store.setState({ settings, persistedUIReady: true })
  const result = store.getState().setGroupBy('none')
  expect(result).toBe(saving.promise)
  store.setState({
    groupBy: 'repo',
    collapsedGroups: new Set(['repo:later']),
    settings: { ...settings, activeRuntimeEnvironmentId: 'another' }
  })
  saving.resolve()
  await result
  expect(store.getState().groupBy).toBe('repo')
  expect([...store.getState().collapsedGroups]).toEqual(['repo:later'])
})
