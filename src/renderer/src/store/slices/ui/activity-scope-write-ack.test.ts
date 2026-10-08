import { afterEach, expect, it, vi } from 'vitest'
import { createUIStore } from '../ui-slice-test-harness'
afterEach(() => vi.unstubAllGlobals())
it('returns each original single scope write without a late state overwrite', async () => {
  const store = createUIStore()
  const operations = [
    () => store.getState().setAgentsVisibleHostIds(['local']),
    () => store.getState().setAgentsFilterRepoIds(['project']),
    () => store.getState().setAgentsHideWorkspacesFromOtherDevices(true),
    () => store.getState().setAgentsHideAutomationGeneratedWorkspaces(true),
    () => store.getState().setAgentsHideCliCreatedWorkspaces(true)
  ]
  const patches = [
    { agentsVisibleHostIds: ['local'] },
    { agentsFilterRepoIds: ['project'] },
    { agentsHideWorkspacesFromOtherDevices: true },
    { agentsHideAutomationGeneratedWorkspaces: true },
    { agentsHideCliCreatedWorkspaces: true }
  ]
  for (const [index, operation] of operations.entries()) {
    const saving = Promise.withResolvers<void>()
    const setWithAck = vi.fn(() => saving.promise)
    const set = vi.fn()
    vi.stubGlobal('window', { api: { ui: { setWithAck, set } } })
    const result = operation()
    expect(result).toBe(saving.promise)
    expect(setWithAck).toHaveBeenCalledExactlyOnceWith(patches[index])
    expect(set).not.toHaveBeenCalled()
    store.setState({ agentsGroupBy: 'status' })
    const newer = store.getState()
    saving.resolve()
    await result
    expect(store.getState()).toBe(newer)
  }
})
