import { expect, it, vi } from 'vitest'
import {
  subscribeMigrationUnsupportedPtyChanges,
  publishMigrationUnsupportedPtyChange,
  getMigrationUnsupportedPtyObserverCount
} from '../../src/main/agent-hooks/migration-unsupported-pty-observers'
import type { MigrationUnsupportedPtyEvent } from '../../src/main/agent-hooks/migration-unsupported-pty-observers'

it('isolates a failed reader and its failed cleanup from the canonical notification and other readers', () => {
  const baseline = getMigrationUnsupportedPtyObserverCount()
  const failed = vi.fn(() => {
    throw new Error('Fixture cleanup failure')
  })
  const healthy = vi.fn()
  const closeBad = subscribeMigrationUnsupportedPtyChanges(() => {
    throw new Error('Fixture reader failure')
  }, failed)
  const closeHealthy = subscribeMigrationUnsupportedPtyChanges(healthy, () => {})
  const event: MigrationUnsupportedPtyEvent = { type: 'clear', ptyId: 'fixture' }
  try {
    expect(() => publishMigrationUnsupportedPtyChange(event)).not.toThrow()
    expect(failed).toHaveBeenCalledOnce()
    expect(healthy).toHaveBeenCalledWith(event)
    expect(getMigrationUnsupportedPtyObserverCount()).toBe(baseline + 1)
  } finally {
    closeBad()
    closeHealthy()
  }
  expect(getMigrationUnsupportedPtyObserverCount()).toBe(baseline)
})
