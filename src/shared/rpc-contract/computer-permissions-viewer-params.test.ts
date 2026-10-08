import { describe, expect, it } from 'vitest'
import { ComputerPermissionsViewerState } from './computer-permissions-viewer-params'

const reply = {
  platform: 'darwin',
  permissions: [{ id: 'accessibility', status: 'granted' }],
  loading: false,
  helperUnavailable: false
}

describe('Computer Use permission reply compatibility', () => {
  it('preserves future permission rows and degrades unknown platform and status safely', () => {
    expect(
      ComputerPermissionsViewerState.parse({
        ...reply,
        platform: 'future-platform',
        permissions: [
          ...reply.permissions,
          { id: 'screenshots', status: 'not-granted' },
          { id: 'future-permission', status: 'future-status' }
        ]
      })
    ).toEqual({
      ...reply,
      platform: null,
      permissions: [
        ...reply.permissions,
        { id: 'screenshots', status: 'not-granted' },
        { id: 'future-permission', status: 'unsupported' }
      ]
    })
  })

  it('rejects malformed values rather than treating them as safe future enum values', () => {
    for (const malformed of [
      { ...reply, platform: 1 },
      { ...reply, permissions: [{ id: 1, status: 'granted' }] },
      { ...reply, permissions: [{ id: '', status: 'granted' }] },
      { ...reply, permissions: [{ id: 'accessibility', status: false }] },
      { ...reply, permissions: [reply.permissions[0], reply.permissions[0]] },
      { ...reply, loading: 'false' }
    ]) {
      expect(ComputerPermissionsViewerState.safeParse(malformed).success).toBe(false)
    }
  })

  it('keeps known statuses and null platform, and strips private provider fields', () => {
    expect(
      ComputerPermissionsViewerState.parse({
        ...reply,
        platform: null,
        helperAppPath: 'private-provider-path',
        permissions: [{ id: 'screenshots', status: 'unsupported', reason: 'private-reason' }]
      })
    ).toEqual({
      ...reply,
      platform: null,
      permissions: [{ id: 'screenshots', status: 'unsupported' }]
    })
  })
})
