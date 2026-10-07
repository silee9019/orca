import { afterEach, expect, it, vi } from 'vitest'
import { requestDesktopNotificationSound } from './notification-sound-cli'
import { registerNotificationSoundCliBridge } from '../../preload/api/notification-sound-cli-bridge'
const bus = vi.hoisted(() => {
  const main = new Map<string, (event: unknown, payload: unknown) => void>()
  const preload = new Map<string, (event: unknown, payload: unknown) => void>()
  const renderer = {
    send: vi.fn((channel: string, payload: unknown) => preload.get(channel)?.({}, payload))
  }
  return {
    main,
    preload,
    renderer,
    playSound: vi.fn(async () => ({ played: true })),
    available: true
  }
})
vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, listener: (event: unknown, payload: unknown) => void) =>
      bus.main.set(channel, listener),
    removeListener: (channel: string) => bus.main.delete(channel)
  },
  ipcRenderer: {
    on: (channel: string, listener: (event: unknown, payload: unknown) => void) =>
      bus.preload.set(channel, listener),
    removeListener: (channel: string) => bus.preload.delete(channel),
    send: (channel: string, payload: unknown) =>
      bus.main.get(channel)?.({ sender: bus.renderer }, payload)
  }
}))
vi.mock('../ipc/ui', () => ({
  getTrustedUIRendererWebContents: () => (bus.available ? bus.renderer : null)
}))
vi.mock('../../preload/api/notifications-bridge', () => ({
  notificationsApi: { playSound: bus.playSound }
}))
afterEach(() => {
  vi.useRealTimers()
  bus.available = true
  bus.main.clear()
  bus.preload.clear()
  vi.clearAllMocks()
})
it('acknowledges the existing preload sound effect and removes the request listeners', async () => {
  const cleanup = registerNotificationSoundCliBridge()
  expect(await requestDesktopNotificationSound({ volume: 25 })).toEqual({ played: true })
  expect(bus.playSound).toHaveBeenCalledExactlyOnceWith({ volume: 25 })
  expect(bus.main.size).toBe(0)
  cleanup()
  expect(bus.preload.size).toBe(0)
})
it('reports missing or old viewers without claiming playback and cleans timed out requests', async () => {
  bus.available = false
  await expect(requestDesktopNotificationSound({})).rejects.toThrow('desktop_unavailable')
  bus.available = true
  vi.useFakeTimers()
  const result = requestDesktopNotificationSound({})
  const rejected = expect(result).rejects.toThrow('desktop_ack_timeout')
  await vi.advanceTimersByTimeAsync(5000)
  await rejected
  expect(bus.main.size).toBe(0)
  expect(bus.playSound).not.toHaveBeenCalled()
})
it('ignores a result from another renderer and cancels waiting without claiming playback', async () => {
  const controller = new AbortController()
  const pending = requestDesktopNotificationSound({}, controller.signal)
  const rejected = expect(pending).rejects.toThrow('request_cancelled')
  const [channel, payload] = bus.renderer.send.mock.calls[0] ?? []
  expect(channel).toBe('notifications:cliPlaySound')
  const parsed = (
    await import('../../shared/notification-sound-cli')
  ).NotificationSoundCliRequest.parse(payload)
  bus.main.get('notifications:cliPlaySoundResult')?.(
    { sender: {} },
    { requestId: parsed.requestId, result: { played: true } }
  )
  controller.abort()
  await rejected
  expect(bus.main.size).toBe(0)
  expect(bus.playSound).not.toHaveBeenCalled()
})
