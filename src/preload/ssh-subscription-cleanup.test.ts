import { afterEach, expect, it, vi } from 'vitest'
const { bus } = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  return { bus: new EventEmitter() }
})
vi.mock('electron', () => ({
  ipcRenderer: {
    on: bus.on.bind(bus),
    removeListener: bus.removeListener.bind(bus),
    invoke: vi.fn()
  }
}))
import { sshApi } from './api/ssh-bridge'
afterEach(() => bus.removeAllListeners())
it.each([
  [
    'ssh:state-changed',
    (callback: () => void) => sshApi.onStateChanged(callback),
    {
      targetId: 'host-a',
      state: { targetId: 'host-a', status: 'connected', error: null, reconnectAttempt: 0 }
    }
  ],
  [
    'ssh:credential-request',
    (callback: () => void) => sshApi.onCredentialRequest(callback),
    {
      requestId: 'request-a',
      targetId: 'host-a',
      kind: 'password',
      detail: 'fixture'
    }
  ],
  [
    'ssh:credential-resolved',
    (callback: () => void) => sshApi.onCredentialResolved(callback),
    { requestId: 'request-a' }
  ],
  [
    'ssh:detected-ports-changed',
    (callback: () => void) => sshApi.onDetectedPortsChanged(callback),
    { targetId: 'host-a', ports: [] }
  ],
  [
    'ssh:port-forwards-changed',
    (callback: () => void) => sshApi.onPortForwardsChanged(callback),
    { targetId: 'host-a', forwards: [] }
  ]
] as const)(
  'releases the exact %s subscription and drops later IPC deliveries',
  (channel, subscribe, payload) => {
    const callback = vi.fn()
    const stop = subscribe(callback)
    expect(bus.listenerCount(channel)).toBe(1)
    bus.emit(channel, {}, payload)
    expect(callback).toHaveBeenCalledOnce()
    stop()
    stop()
    expect(bus.listenerCount(channel)).toBe(0)
    bus.emit(channel, {}, payload)
    expect(callback).toHaveBeenCalledOnce()
  }
)
