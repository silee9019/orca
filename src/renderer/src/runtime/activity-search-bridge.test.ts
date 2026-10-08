// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  bumpProviderRuntimeSessionGeneration,
  getProviderRuntimeContextKey
} from '@/lib/provider-runtime-context'
import { publishActivitySearchControl } from './activity-search-controls'
import { applyActivityViewerRequest } from './activity-viewer-bridge'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'
const fixture = vi.hoisted(() => ({
  state: {
    settings: { activeRuntimeEnvironmentId: null },
    persistedUIReady: true,
    agentsGroupBy: 'none',
    agentsReadFilter: 'all',
    agentsCompactMode: false,
    agentsShowChildAgents: true,
    agentsShowSearch: false
  },
  query: '',
  committed: '',
  settled: true
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('./activity-viewer-view', () => ({
  readActivityViewerView: (surface: string) => ({
    surface,
    runtimeContextKey: getProviderRuntimeContextKey(fixture.state.settings),
    groupBy: 'none',
    readFilter: 'all',
    compact: false,
    showChildAgents: true,
    query: fixture.committed,
    querySettled: fixture.settled,
    densityMeasured: true,
    logicalRows: [],
    renderedRows: []
  })
}))
let remove: (() => void) | undefined
let input: HTMLInputElement | null
const setQuery = vi.fn((query: string) => {
  fixture.query = query
  fixture.committed = query
  if (input) {
    input.value = query
  }
})
const setShowSearch = vi.fn(async (visible: boolean) => {
  fixture.state.agentsShowSearch = visible
  if (visible) {
    input = document.createElement('input')
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 20))
    document.body.append(input)
    input.focus()
  } else {
    setQuery('')
    input?.remove()
    input = null
  }
})
const run = (operation: ActivityViewerCommand) =>
  applyActivityViewerRequest({
    id: 'search',
    expiresAt: Date.now() + 150,
    command: operation
  })
const target = { viewer: 'host', surface: 'sidebar-agents' } as const
beforeEach(() => {
  vi.clearAllMocks()
  fixture.query = ''
  fixture.committed = ''
  fixture.settled = true
  fixture.state.agentsShowSearch = false
  input = null
  remove = publishActivitySearchControl('sidebar-agents', {
    getInput: () => input,
    getQuery: () => fixture.query,
    setQuery,
    setShowSearch
  })
  vi.stubGlobal(
    'window',
    Object.assign(window, {
      api: {
        ui: {
          setWithAck: vi.fn(),
          get: vi.fn(async () => ({ agentsShowSearch: fixture.state.agentsShowSearch }))
        }
      }
    })
  )
})
afterEach(() => {
  remove?.()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('keeps hidden search unavailable without writing or opening it', async () => {
  await expect(run({ ...target, operation: 'search', query: 'task' })).rejects.toThrow(
    'activity_search_unavailable'
  )
  expect(setQuery).not.toHaveBeenCalled()
  expect(setShowSearch).not.toHaveBeenCalled()
})
it('preserves visibility focus and hide clears, while query stays local', async () => {
  expect(await run({ ...target, operation: 'search-visible', enabled: true })).toMatchObject({
    applied: true,
    persisted: true
  })
  expect(await run({ ...target, operation: 'search', query: 'task' })).toMatchObject({
    applied: true,
    persisted: null,
    writeOutcome: 'not_requested'
  })
  expect(input?.value).toBe('task')
  expect(window.api.ui.setWithAck).not.toHaveBeenCalled()
  expect(await run({ ...target, operation: 'search-visible', enabled: false })).toMatchObject({
    applied: true,
    persisted: true
  })
  expect(fixture.query).toBe('')
  expect(setShowSearch).toHaveBeenCalledTimes(2)
})
it('does not claim a query before the deferred list commits', async () => {
  vi.useFakeTimers()
  await setShowSearch(true)
  fixture.settled = false
  const pending = run({ ...target, operation: 'search', query: 'task' })
  await vi.advanceTimersByTimeAsync(200)
  expect(await pending).toMatchObject({
    applied: false,
    persisted: null,
    reason: 'viewer_not_applied'
  })
})

it('fences a runtime session change while the query list is unsettled', async () => {
  vi.useFakeTimers()
  await setShowSearch(true)
  fixture.settled = false
  const pending = run({ ...target, operation: 'search', query: 'task' })
  bumpProviderRuntimeSessionGeneration()
  await vi.advanceTimersByTimeAsync(25)
  expect(await pending).toMatchObject({
    applied: false,
    persisted: null,
    reason: 'viewer_runtime_changed'
  })
})
it('keeps a rejected visibility write separate from its optimistic focused input', async () => {
  await setShowSearch(true)
  setShowSearch.mockRejectedValueOnce(new Error('rejected'))
  expect(await run({ ...target, operation: 'search-visible', enabled: true })).toMatchObject({
    applied: true,
    persisted: false,
    writeOutcome: 'rejected',
    reason: 'persistence_failed'
  })
})

it('does not claim a query superseded by a local UI edit during deferred work', async () => {
  vi.useFakeTimers()
  await setShowSearch(true)
  fixture.settled = false
  const pending = run({ ...target, operation: 'search', query: 'task' })
  setQuery('edited locally')
  fixture.settled = true
  await vi.advanceTimersByTimeAsync(200)
  expect(await pending).toMatchObject({
    applied: false,
    persisted: null,
    reason: 'viewer_not_applied'
  })
})
it('rejects a remounted control even when it publishes the same requested query', async () => {
  vi.useFakeTimers()
  await setShowSearch(true)
  fixture.settled = false
  const pending = run({ ...target, operation: 'search', query: 'task' })
  remove?.()
  remove = publishActivitySearchControl('sidebar-agents', {
    getInput: () => input,
    getQuery: () => fixture.query,
    setQuery,
    setShowSearch
  })
  fixture.settled = true
  await vi.advanceTimersByTimeAsync(200)
  expect(await pending).toMatchObject({ applied: false, persisted: null })
})
it('does not turn an unsettled visibility parent into an accepted write', async () => {
  vi.useFakeTimers()
  await setShowSearch(true)
  setShowSearch.mockImplementationOnce(() => new Promise<void>(() => {}))
  const pending = run({ ...target, operation: 'search-visible', enabled: true })
  await vi.advanceTimersByTimeAsync(200)
  expect(await pending).toMatchObject({ writeOutcome: 'unknown' })
})
it('keeps unavailable host readback separate from the visible search input', async () => {
  vi.useFakeTimers()
  await setShowSearch(true)
  vi.spyOn(window.api.ui, 'get').mockImplementationOnce(() => new Promise(() => {}))
  const pending = run({ ...target, operation: 'search-visible', enabled: true })
  await vi.advanceTimersByTimeAsync(200)
  expect(await pending).toMatchObject({ persisted: null, reason: 'persistence_unverifiable' })
})
