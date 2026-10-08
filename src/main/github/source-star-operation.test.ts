import { afterEach, expect, it, vi } from 'vitest'
import { starOrca } from './client'
import { track } from '../telemetry/client'
import { starOrcaFromSource } from './source-star-operation'

vi.mock('./client', () => ({ starOrca: vi.fn() }))
vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({
  getCohortAtEmit: () => ({ nth_repo_added: 3 })
}))
afterEach(() => vi.clearAllMocks())

it('uses the existing star service and emits source context only after success', async () => {
  vi.mocked(starOrca).mockResolvedValue(true)
  expect(await starOrcaFromSource('settings')).toBe(true)
  expect(starOrca).toHaveBeenCalledExactlyOnceWith()
  expect(track).toHaveBeenCalledExactlyOnceWith('app_starred_orca', {
    source: 'settings',
    nth_repo_added: 3
  })
})

it('preserves false and invalid-source IPC behavior without emitting success telemetry', async () => {
  vi.mocked(starOrca).mockResolvedValue(false)
  expect(await starOrcaFromSource('settings')).toBe(false)
  vi.mocked(starOrca).mockResolvedValue(true)
  expect(await starOrcaFromSource('unknown-source')).toBe(true)
  expect(track).not.toHaveBeenCalled()
})
