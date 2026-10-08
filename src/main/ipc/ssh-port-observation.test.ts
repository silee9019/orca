import { beforeEach, expect, it, vi } from 'vitest'
import type { SshPortObservation } from '../../shared/ssh-port-observation'
import { broadcastPortForwards, broadcastDetectedPorts } from './ssh-renderer-broadcast'
const { publish, listForwards } = vi.hoisted(() => ({
  publish: vi.fn<(value: SshPortObservation) => void>(),
  listForwards: vi.fn(() => [
    {
      id: 'forward-a',
      connectionId: 'host-a',
      localPort: 3000,
      remoteHost: 'private-host-canary',
      remotePort: 3000,
      label: 'private-label-canary',
      advertisedUrl: 'private-url-canary'
    }
  ])
}))
vi.mock('./ssh-ipc-context', () => ({
  connectionManager: null,
  persistedStore: null,
  portForwardManager: { listForwards },
  currentRuntime: { notifySshPortObservation: publish },
  getCurrentMainWindow: () => null
}))
beforeEach(() => {
  publish.mockClear()
  listForwards.mockClear()
})
it('publishes canonical forward manager changes without a GUI window or private free text', () => {
  broadcastPortForwards(() => null, 'host-a')
  expect(listForwards).toHaveBeenCalledExactlyOnceWith('host-a')
  expect(publish).toHaveBeenCalledExactlyOnceWith({
    source: 'forwards',
    targetId: 'host-a',
    forwards: [{ id: 'forward-a', localPort: 3000, remotePort: 3000 }]
  })
  expect(JSON.stringify(publish.mock.calls)).not.toContain('private-')
})
it('publishes scanner detection/removal snapshots through the same existing headless broadcast owner', () => {
  broadcastDetectedPorts(() => null, 'host-a', [
    { port: 3000, host: 'private-host-canary', pid: 100, processName: 'private-process-canary' }
  ])
  broadcastDetectedPorts(() => null, 'host-a', [])
  expect(publish.mock.calls.map(([value]) => value)).toEqual([
    { source: 'detected', targetId: 'host-a', ports: [3000] },
    { source: 'detected', targetId: 'host-a', ports: [] }
  ])
  expect(JSON.stringify(publish.mock.calls)).not.toContain('private-')
})

it('keeps runtime-owned SSH targets outside public port observations', () => {
  broadcastPortForwards(() => null, 'runtime-ssh-private-target')
  broadcastDetectedPorts(() => null, 'runtime-ssh-private-target', [
    { host: 'private-host-canary', port: 3000 }
  ])
  expect(publish).not.toHaveBeenCalled()
  expect(listForwards).not.toHaveBeenCalled()
})
