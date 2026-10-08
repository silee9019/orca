import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { desktopAppTarget } from '../runtime/rpc/methods/desktop-app-target'
import { requestAppSurfaceControl } from './app-surface-control'

const fixture = vi.hoisted(() => {
  const result: {
    sender: { send: ReturnType<typeof vi.fn> }
    listener?: (event: { sender: object }, reply: unknown) => void
  } = { sender: { send: vi.fn() } }
  return result
})
vi.mock('electron', () => ({
  BrowserWindow: {
    fromId: (id: number) =>
      id === 7 ? { id, webContents: fixture.sender, isDestroyed: () => false } : null
  },
  ipcMain: {
    on: (_name: string, listener: typeof fixture.listener) => {
      fixture.listener = listener
    }
  }
}))
vi.mock('../ipc/ui', () => ({
  isTrustedUIRenderer: (sender: unknown) => sender === fixture.sender
}))
vi.mock('../runtime/orca-runtime', () => ({
  OrcaRuntimeService: class {
    getRuntimeId() {
      return 'surface-fixture'
    }
    getStatus() {
      return { desktopWindowStatus: 'available' }
    }
  }
}))
const context = { runtime: OrcaRuntimeService.prototype }
const params = () => ({
  viewer: 7,
  confirmTarget: desktopAppTarget(context),
  action: { kind: 'shell' as const, action: 'status' as const }
})
function sentId(): string {
  const input: unknown = fixture.sender.send.mock.lastCall?.[1]
  if (
    !input ||
    typeof input !== 'object' ||
    !('requestId' in input) ||
    typeof input.requestId !== 'string'
  ) {
    throw new Error('Missing request')
  }
  return input.requestId
}
beforeEach(() =>
  Object.defineProperty(process.versions, 'electron', { configurable: true, value: 'fixture' })
)
afterEach(() => {
  Reflect.deleteProperty(process.versions, 'electron')
})
describe('targeted app surface request', () => {
  it('rejects a stale app and unavailable viewer before sending', async () => {
    fixture.sender.send.mockClear()
    await expect(
      requestAppSurfaceControl({ ...params(), confirmTarget: 'stale' }, context)
    ).rejects.toThrow()
    await expect(requestAppSurfaceControl({ ...params(), viewer: 8 }, context)).rejects.toThrow()
    expect(fixture.sender.send).not.toHaveBeenCalled()
  })
  it('accepts only the trusted responding viewer and never claims rendering', async () => {
    const operation = requestAppSurfaceControl(params(), context)
    const requestId = sentId()
    fixture.listener?.({ sender: {} }, { requestId, ok: true, result: { canary: 'wrong' } })
    fixture.listener?.(
      { sender: fixture.sender },
      { requestId, ok: true, result: { sidebarOpen: true } }
    )
    await expect(operation).resolves.toEqual({
      state: 'acknowledged',
      viewer: 7,
      rendered: false,
      result: { sidebarOpen: true }
    })
    fixture.listener?.({ sender: fixture.sender }, { requestId, ok: true })
  })
  it('propagates unmounted/error replies and caller cancellation', async () => {
    const operation = requestAppSurfaceControl(params(), context)
    fixture.listener?.(
      { sender: fixture.sender },
      { requestId: sentId(), ok: false, error: 'not mounted' }
    )
    await expect(operation).rejects.toThrow('not mounted')
    const controller = new AbortController()
    const cancelled = requestAppSurfaceControl(params(), { ...context, signal: controller.signal })
    controller.abort()
    await expect(cancelled).rejects.toThrow('disconnected')
  })
})
