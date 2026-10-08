import { afterEach, expect, it, vi } from 'vitest'
import { requestProjectFilterControl, publishProjectFilterControl } from './project-filter-controls'

afterEach(() => vi.useRealTimers())

it('rejects absent and ambiguous filter surfaces without applying an action', async () => {
  const command = { action: 'search', surface: 'sidebar', query: 'orca' } as const
  await expect(requestProjectFilterControl(command, Date.now() + 100)).rejects.toThrow(
    'filter_surface_unavailable'
  )
  const apply = vi.fn()
  const snapshot = {
    open: true,
    query: '',
    highlightedRepoId: '',
    resultRepoIds: [],
    inputFocused: false
  }
  const dispose1 = publishProjectFilterControl('sidebar', { snapshot, apply })
  const dispose2 = publishProjectFilterControl('sidebar', { snapshot, apply })
  await expect(requestProjectFilterControl(command, Date.now() + 100)).rejects.toThrow(
    'filter_surface_ambiguous'
  )
  expect(apply).not.toHaveBeenCalled()
  dispose1()
  dispose2()
})

it('acknowledges a control only after its component publishes the resulting layout', async () => {
  const snapshot = {
    open: true,
    query: '',
    highlightedRepoId: '',
    resultRepoIds: ['a'],
    inputFocused: false
  }
  let dispose = publishProjectFilterControl('sidebar', {
    snapshot,
    apply: vi.fn(() => {
      queueMicrotask(() => {
        dispose()
        dispose = publishProjectFilterControl('sidebar', {
          snapshot: { ...snapshot, query: 'a' },
          apply: vi.fn()
        })
      })
    })
  })
  expect(
    await requestProjectFilterControl(
      { surface: 'sidebar', action: 'search', query: 'a' },
      Date.now() + 1000
    )
  ).toMatchObject({ query: 'a' })
  dispose()
})
