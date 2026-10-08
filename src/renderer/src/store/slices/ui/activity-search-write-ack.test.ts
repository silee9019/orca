import { afterEach, expect, it, vi } from 'vitest'
import { createUIStore } from '../ui-slice-test-harness'

afterEach(() => vi.unstubAllGlobals())
it('keeps the original single search-visibility write and does not overwrite a later edit', async () => {
  const saving = Promise.withResolvers<void>()
  const set = vi.fn(() => saving.promise)
  vi.stubGlobal('window', { api: { ui: { set } } })
  const store = createUIStore()
  const result = store.getState().setAgentsShowSearch(false)
  expect(result).toBe(saving.promise)
  expect(set).toHaveBeenCalledExactlyOnceWith({ agentsShowSearch: false })
  expect(store.getState().agentsShowSearch).toBe(false)
  store.setState({ agentsShowSearch: true })
  saving.resolve()
  await result
  expect(store.getState().agentsShowSearch).toBe(true)
})
