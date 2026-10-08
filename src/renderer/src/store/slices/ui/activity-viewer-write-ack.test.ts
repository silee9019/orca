import { afterEach, expect, it, vi } from 'vitest'
import type { PersistedUIState } from '../../../../../shared/persisted-ui-state-types'
import { createUIStore } from '../ui-slice-test-harness'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('exposes the four existing preference write failures without changing their fields', async () => {
  const failure = new Error('rejected')
  const setWithAck = vi.fn(async (_patch: Partial<PersistedUIState>) => {
    throw failure
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('window', { api: { ui: { setWithAck, set: vi.fn(async () => {}) } } })
  const store = createUIStore()
  const state = store.getState()
  const writes = [
    state.setAgentsGroupBy('project'),
    state.setAgentsReadFilter('unread'),
    state.setAgentsCompactMode(false),
    state.setAgentsShowChildAgents(true)
  ]
  await expect(Promise.all(writes)).rejects.toBe(failure)
  expect(setWithAck.mock.calls.map((args) => args[0])).toEqual([
    { agentsGroupBy: 'project' },
    { agentsReadFilter: 'unread' },
    { agentsCompactMode: false },
    { agentsShowChildAgents: true }
  ])
  expect(store.getState()).toMatchObject({
    agentsGroupBy: 'project',
    agentsReadFilter: 'unread',
    agentsCompactMode: false,
    agentsShowChildAgents: true
  })
})
it('returns the original preference Promise without merging a late response', async () => {
  const saving = Promise.withResolvers<void>()
  vi.stubGlobal('window', {
    api: { ui: { setWithAck: vi.fn(() => saving.promise), set: vi.fn(async () => {}) } }
  })
  const store = createUIStore()
  const result = store.getState().setAgentsGroupBy('project')
  expect(result).toBe(saving.promise)
  store.setState({ agentsGroupBy: 'agent' })
  saving.resolve()
  await result
  expect(store.getState().agentsGroupBy).toBe('agent')
})
