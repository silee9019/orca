import { afterEach, expect, it, vi } from 'vitest'
import type { PersistedUIState } from '../../../shared/persisted-ui-state-types'
import { makePersistedUI } from '@/store/slices/ui-slice-test-harness'
import { pollPersistedUi } from './persisted-ui-readback'

const get = vi.fn<() => Promise<PersistedUIState | null>>()
const state = (collapsedGroups: string[]): PersistedUIState => makePersistedUI({ collapsedGroups })
afterEach(() => {
  get.mockReset()
  vi.unstubAllGlobals()
})
const poll = (matches: (ui: PersistedUIState) => boolean, keepWaiting = () => true, ms = 400) => {
  vi.stubGlobal('window', { api: { ui: { get } } })
  return pollPersistedUi({ matches, keepWaiting, deadline: Date.now() + ms })
}

it('keeps reading until the host shows the value', async () => {
  get.mockResolvedValueOnce(state([])).mockResolvedValue(state(['a']))
  const result = await poll((ui) => ui.collapsedGroups.includes('a'))
  expect(result).toEqual({ ui: state(['a']), read: true })
  expect(get).toHaveBeenCalledTimes(2)
})
it('stops at the deadline with the last read, and at once when the caller no longer waits', async () => {
  get.mockResolvedValue(state([]))
  expect(
    await poll(
      () => false,
      () => true,
      120
    )
  ).toEqual({ ui: state([]), read: true })
  get.mockClear()
  expect(
    await poll(
      () => false,
      () => false
    )
  ).toEqual({ ui: null, read: false })
  expect(get).not.toHaveBeenCalled()
})
it('reports a read that never answers as unread', async () => {
  get.mockImplementation(() => new Promise<never>(() => undefined))
  expect(
    await poll(
      () => true,
      () => true,
      100
    )
  ).toEqual({ ui: null, read: false })
})
