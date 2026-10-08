// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { copyActivityLinkedWorkItemLink } from './activity-thread-copy'
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: notify }))
const write = vi.fn<(value: string) => Promise<void>>()
afterEach(() => {
  write.mockReset()
  notify.success.mockReset()
  notify.error.mockReset()
})
it.each(['Issue link', 'Pull request link'])(
  'preserves the original %s toast after its clipboard ACK',
  async (label) => {
    write.mockResolvedValue()
    Object.defineProperty(window, 'api', {
      value: { ui: { writeClipboardText: write } },
      configurable: true
    })
    expect(await copyActivityLinkedWorkItemLink('https://example.com/item', label)).toBe(true)
    expect(write).toHaveBeenCalledExactlyOnceWith('https://example.com/item')
    expect(notify.success).toHaveBeenCalledExactlyOnceWith(`${label} copied`)
    expect(notify.error).not.toHaveBeenCalled()
  }
)
it('preserves the original error toast and returns no write acknowledgement on rejection', async () => {
  write.mockRejectedValue(new Error('denied'))
  Object.defineProperty(window, 'api', {
    value: { ui: { writeClipboardText: write } },
    configurable: true
  })
  expect(await copyActivityLinkedWorkItemLink('https://example.com/item', 'Issue link')).toBe(false)
  expect(notify.error).toHaveBeenCalledExactlyOnceWith('Failed to copy link')
  expect(notify.success).not.toHaveBeenCalled()
})
