import { beforeEach, expect, it, vi } from 'vitest'
import { readSshPortObservationSnapshot } from './ssh-port-observation-snapshot'
const { listPortForwards, listDetectedPorts, targets } = vi.hoisted(() => ({
  listPortForwards: vi.fn(() => [
    {
      id: 'forward-a',
      connectionId: 'host-a',
      localPort: 3000,
      remoteHost: 'private-host-canary',
      remotePort: 3000,
      advertisedUrl: 'private-url-canary'
    }
  ]),
  listDetectedPorts: vi.fn(() => [
    { port: 3000, host: 'private-host-canary', processName: 'private-process-canary' }
  ]),
  targets: vi.fn(() => [{ id: 'host-a' }, { id: 'runtime-ssh-hidden' }])
}))
vi.mock('../ssh/ssh-target-registry', () => ({
  getSshPortForwardManagement: () => ({ listPortForwards, listDetectedPorts }),
  listRegisteredSshTargets: targets
}))
beforeEach(() => {
  vi.clearAllMocks()
})
it('queries the canonical owners for each public target and strips free text from the snapshot', () => {
  const result = readSshPortObservationSnapshot()
  expect(listPortForwards).toHaveBeenCalledExactlyOnceWith({ targetId: 'host-a' })
  expect(listDetectedPorts).toHaveBeenCalledExactlyOnceWith({ targetId: 'host-a' })
  expect(result).toEqual([
    {
      source: 'forwards',
      targetId: 'host-a',
      forwards: [{ id: 'forward-a', localPort: 3000, remotePort: 3000 }]
    },
    { source: 'detected', targetId: 'host-a', ports: [3000] }
  ])
  expect(JSON.stringify(result)).not.toContain('private-')
})
it('does not replace a failed canonical query with an invented empty snapshot', () => {
  listPortForwards.mockImplementationOnce(() => {
    throw new Error('private-owner-canary')
  })
  expect(readSshPortObservationSnapshot).toThrow('private-owner-canary')
})
