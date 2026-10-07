import { beforeEach, describe, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => {
  const handlers = new Map<
    string,
    (event: { sender: { id: number } }, input: unknown) => Promise<unknown>
  >()
  return {
    handlers,
    handle: vi.fn(
      (
        name: string,
        handler: (event: { sender: { id: number } }, input: unknown) => Promise<unknown>
      ) => handlers.set(name, handler)
    ),
    removeHandler: vi.fn(),
    trusted: vi.fn(() => true),
    authorized: vi.fn(),
    probe: vi.fn()
  }
})
vi.mock('electron', () => ({ ipcMain: fixture }))
vi.mock('../browser/browser-manager', () => ({
  browserManager: { getAuthorizedGuest: fixture.authorized }
}))
vi.mock('./browser-renderer-trust', () => ({ isTrustedBrowserRenderer: fixture.trusted }))
vi.mock('../browser/browser-grab-copy-shortcut-priority', () => ({
  probeBrowserGrabCopyShortcutPriority: fixture.probe
}))
import { registerBrowserGrabCopyPriorityHandler } from './browser-grab-copy-priority-ipc'
function invoke(input: unknown = { browserPageId: 'page' }): Promise<unknown> {
  const handler = fixture.handlers.get('browser:grabCopyShortcutPriority')
  if (!handler) {
    throw new Error('handler_missing')
  }
  return handler({ sender: { id: 41 } }, input)
}
describe('browser copy shortcut authorized guest priority', () => {
  const guest = { id: 71, isDestroyed: vi.fn(() => false), isFocused: vi.fn(() => true) }
  beforeEach(() => {
    vi.clearAllMocks()
    fixture.trusted.mockReturnValue(true)
    fixture.authorized.mockReturnValue(guest)
    fixture.probe.mockResolvedValue(true)
    guest.isDestroyed.mockReturnValue(false)
    guest.isFocused.mockReturnValue(true)
    registerBrowserGrabCopyPriorityHandler()
  })
  it('uses the exact authorized guest and strict fixed-probe boolean without copying', async () => {
    await expect(invoke()).resolves.toEqual({ allowed: true, guestFocused: true, guestId: 71 })
    expect(fixture.authorized).toHaveBeenCalledWith('page', 41)
    expect(fixture.probe).toHaveBeenCalledExactlyOnceWith(guest)
    fixture.probe.mockResolvedValue(false)
    await expect(invoke()).resolves.toMatchObject({ allowed: false })
  })
  it('keeps renderer chrome priority separate from the unfocused guest selection', async () => {
    guest.isFocused.mockReturnValue(false)
    await expect(invoke()).resolves.toEqual({ allowed: true, guestFocused: false, guestId: 71 })
    expect(fixture.probe).not.toHaveBeenCalled()
  })
  it('rejects untrusted, invalid and unregistered owners before probing', async () => {
    fixture.trusted.mockReturnValue(false)
    await expect(invoke()).rejects.toThrow('not_authorized')
    fixture.trusted.mockReturnValue(true)
    await expect(invoke({ browserPageId: '' })).rejects.toThrow()
    fixture.authorized.mockReturnValue(null)
    await expect(invoke()).rejects.toThrow('not_ready')
    expect(fixture.probe).not.toHaveBeenCalled()
  })
  it.each([undefined, null, 1, 'true', {}])(
    'rejects non-boolean probe acknowledgement %s',
    async (value) => {
      fixture.probe.mockResolvedValue(value)
      await expect(invoke()).rejects.toThrow('unverifiable')
    }
  )
  it('rejects replacement, destruction and focus changes while the probe is pending', async () => {
    fixture.probe.mockImplementationOnce(async () => {
      fixture.authorized.mockReturnValue({ ...guest })
      return true
    })
    await expect(invoke()).rejects.toThrow('unverifiable')
    fixture.authorized.mockReturnValue(guest)
    fixture.probe.mockImplementationOnce(async () => {
      guest.isDestroyed.mockReturnValue(true)
      return true
    })
    await expect(invoke()).rejects.toThrow('unverifiable')
    guest.isDestroyed.mockReturnValue(false)
    fixture.probe.mockImplementationOnce(async () => {
      guest.isFocused.mockReturnValue(false)
      return true
    })
    await expect(invoke()).rejects.toThrow('unverifiable')
  })
})
