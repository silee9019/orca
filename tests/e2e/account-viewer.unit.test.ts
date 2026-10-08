import { afterEach, expect, it, vi } from 'vitest'
import { requestAccountViewerAction } from '../../src/main/runtime/account-viewer-request'
import { accountViewerApi } from '../../src/preload/api/account-viewer-bridge'
import { registerAccountViewerBridge } from '../../src/renderer/src/runtime/account-viewer-bridge'
const bus = vi.hoisted(() => {
  const main = new Map<string, Set<(e: unknown, p: unknown) => void>>()
  const preload = new Map<string, (e: unknown, p: unknown) => void>()
  const renderer = { send: vi.fn((c: string, p: unknown) => preload.get(c)?.({}, p)) }
  return {
    main,
    preload,
    renderer,
    available: true,
    resource: vi.fn(async (x: unknown) => ({ applied: x })),
    usage: vi.fn(async () => ({ usage: true })),
    account: vi.fn(async () => ({ account: true }))
  }
})
vi.mock('electron', () => ({
  ipcMain: {
    on: (c: string, l: (e: unknown, p: unknown) => void) => {
      const listeners = bus.main.get(c) ?? new Set()
      listeners.add(l)
      bus.main.set(c, listeners)
    },
    removeListener: (c: string, l: (e: unknown, p: unknown) => void) => {
      bus.main.get(c)?.delete(l)
    }
  },
  ipcRenderer: {
    on: (c: string, l: (e: unknown, p: unknown) => void) => bus.preload.set(c, l),
    removeListener: (c: string) => bus.preload.delete(c),
    send: (c: string, p: unknown) => {
      for (const l of bus.main.get(c) ?? []) {
        l({ sender: bus.renderer }, p)
      }
    }
  }
}))
vi.mock('../../src/main/ipc/ui', () => ({
  getTrustedUIRendererWebContents: () => (bus.available ? bus.renderer : null)
}))
vi.mock('../../src/renderer/src/runtime/resource-manager-viewer-actions', () => ({
  applyResourceManagerViewerAction: bus.resource
}))
vi.mock('../../src/renderer/src/runtime/usage-viewer-actions', () => ({
  applyUsageViewerAction: bus.usage
}))
vi.mock('../../src/renderer/src/runtime/accounts-viewer-actions', () => ({
  applyAccountsViewerAction: bus.account
}))
afterEach(() => {
  bus.main.clear()
  bus.preload.clear()
  bus.available = true
  vi.clearAllMocks()
  vi.useRealTimers()
})
it('routes only fixed domains through preload and acknowledges correlated concurrent effects', async () => {
  const unsubs: (() => void)[] = []
  registerAccountViewerBridge(accountViewerApi, unsubs)
  expect(
    await Promise.all([
      requestAccountViewerAction({
        domain: 'resource',
        action: { action: 'set-open', open: true }
      }),
      requestAccountViewerAction({
        domain: 'usage',
        action: { action: 'set-display-mode', mode: 'compact' }
      }),
      requestAccountViewerAction({
        domain: 'account',
        action: { type: 'open-settings', pane: 'accounts' }
      })
    ])
  ).toEqual([{ applied: { action: 'set-open', open: true } }, { usage: true }, { account: true }])
  expect(bus.resource).toHaveBeenCalledTimes(1)
  expect(bus.usage).toHaveBeenCalledTimes(1)
  expect(bus.account).toHaveBeenCalledTimes(1)
  expect([...bus.main.values()].every((s) => s.size === 0)).toBe(true)
  unsubs.forEach((f) => f())
  expect(bus.preload.size).toBe(0)
})
it('fails closed for unavailable or old viewers and cleans timeout listeners', async () => {
  bus.available = false
  await expect(
    requestAccountViewerAction({ domain: 'resource', action: { action: 'status' } })
  ).rejects.toThrow('desktop_unavailable')
  bus.available = true
  vi.useFakeTimers()
  const p = requestAccountViewerAction({ domain: 'resource', action: { action: 'status' } })
  const rejected = expect(p).rejects.toThrow('desktop_ack_timeout')
  await vi.advanceTimersByTimeAsync(5000)
  await rejected
  expect(bus.resource).not.toHaveBeenCalled()
  expect([...bus.main.values()].every((s) => s.size === 0)).toBe(true)
})
it('ignores forged senders and removes aborted request listeners', async () => {
  const c = new AbortController()
  const p = requestAccountViewerAction(
    { domain: 'resource', action: { action: 'status' } },
    c.signal
  )
  const rejected = expect(p).rejects.toThrow('request_cancelled')
  const payload = bus.renderer.send.mock.calls[0]?.[1]
  const { AccountViewerRequestSchema } = await import('../../src/shared/account-viewer-contract')
  const request = AccountViewerRequestSchema.parse(payload)
  for (const l of bus.main.get('accounts:viewerResponse') ?? []) {
    l({ sender: {} }, { requestId: request.requestId, ok: true, result: { forged: true } })
  }
  c.abort()
  await rejected
  expect([...bus.main.values()].every((s) => s.size === 0)).toBe(true)
})
