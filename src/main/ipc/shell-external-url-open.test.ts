import { expect, it, vi } from 'vitest'
import { openExternalUrlWithAck } from './shell-external-url-open'
it('acknowledges only after the existing OS service accepts the normalized URL', async () => {
  const open = vi.fn<(_: string) => Promise<void>>()
  let finish: (() => void) | undefined
  open.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const result = openExternalUrlWithAck('https://example.test', true, open)
  expect(open).toHaveBeenCalledWith('https://example.test/')
  if (!finish) {
    throw new Error('missing fake OS service completion')
  }
  finish()
  await expect(result).resolves.toEqual({ opened: true })
})
it.each(['invalid', 'file:///local', 'javascript:alert(1)'])(
  'does not acknowledge rejected URL %s or launch the provider',
  async (url) => {
    const open = vi.fn()
    await expect(openExternalUrlWithAck(url, true, open)).rejects.toThrow('external_url_')
    expect(open).not.toHaveBeenCalled()
    await expect(openExternalUrlWithAck(url, false, open)).resolves.toBeUndefined()
  }
)
it('keeps the legacy successful void response', async () => {
  const open = vi.fn().mockResolvedValue(undefined)
  await expect(openExternalUrlWithAck('http://example.test', false, open)).resolves.toBeUndefined()
  expect(open).toHaveBeenCalledWith('http://example.test/')
})
it('redacts provider failures for strict callers while preserving the legacy failure', async () => {
  const failure = new Error('provider detail')
  const open = vi.fn().mockRejectedValue(failure)
  await expect(openExternalUrlWithAck('https://example.test', true, open)).rejects.toThrow(
    'external_url_open_failed'
  )
  await expect(openExternalUrlWithAck('https://example.test', false, open)).rejects.toBe(failure)
})
