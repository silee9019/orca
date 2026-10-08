import { describe, expect, it } from 'vitest'
import { WorkspaceFilterParams } from './workspace-filter-params'

describe('workspace filter command boundary', () => {
  it('supports removing and toggling one exact project without replacing other selections', () => {
    for (const operation of ['remove-project', 'toggle-project']) {
      expect(
        WorkspaceFilterParams.safeParse({ viewer: 'host', operation, repoId: 'a' }).success
      ).toBe(true)
      expect(
        WorkspaceFilterParams.safeParse({ viewer: 'host', operation, repoId: '' }).success
      ).toBe(false)
    }
  })
  it('accepts only explicit host viewers and known filter fields', () => {
    expect(
      WorkspaceFilterParams.parse({
        viewer: 'host',
        operation: 'set',
        filters: { showSleepingWorkspaces: false }
      })
    ).toEqual({ viewer: 'host', operation: 'set', filters: { showSleepingWorkspaces: false } })
    for (const value of [
      { operation: 'get' },
      { viewer: 'all', operation: 'reset' },
      { viewer: 'host', operation: 'set', filters: {} },
      { viewer: 'host', operation: 'set', filters: { showSleepingWorkspaces: 'false' } },
      { viewer: 'host', operation: 'set', filters: { activeRuntimeEnvironmentId: 'other' } },
      { viewer: 'host', operation: 'reset', filters: { filterRepoIds: [] } }
    ]) {
      expect(WorkspaceFilterParams.safeParse(value).success).toBe(false)
    }
  })
})
