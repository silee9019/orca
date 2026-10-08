import { expect, it, vi } from 'vitest'
import {
  subscribeRemoteWorkspaceChanges,
  publishRemoteWorkspaceChange,
  getRemoteWorkspaceChangeObserverCount
} from '../../src/main/ipc/remote-workspace-change-observers'
import type { RemoteWorkspaceChangedEvent } from '../../src/shared/remote-workspace-types'

it('isolates a failed reader and its failed cleanup from the canonical notification and other readers', () => {
  const baseline = getRemoteWorkspaceChangeObserverCount()
  const failed = vi.fn(() => {
    throw new Error('Fixture cleanup failure')
  })
  const healthy = vi.fn()
  const closeBad = subscribeRemoteWorkspaceChanges(() => {
    throw new Error('Fixture reader failure')
  }, failed)
  const closeHealthy = subscribeRemoteWorkspaceChanges(healthy, () => {})
  const event: RemoteWorkspaceChangedEvent = {
    targetId: 'fixture',
    snapshot: {
      namespace: 'fixture',
      revision: 1,
      updatedAt: 1,
      schemaVersion: 1,
      hostObservationToken: 'fixture-token',
      session: {
        activeWorktreePath: null,
        activeTabId: null,
        tabsByWorktreePath: {},
        terminalLayoutsByTabId: {}
      }
    }
  }
  try {
    expect(() => publishRemoteWorkspaceChange(event)).not.toThrow()
    expect(failed).toHaveBeenCalledOnce()
    expect(healthy).toHaveBeenCalledWith(event)
    expect(getRemoteWorkspaceChangeObserverCount()).toBe(baseline + 1)
  } finally {
    closeBad()
    closeHealthy()
  }
  expect(getRemoteWorkspaceChangeObserverCount()).toBe(baseline)
})
