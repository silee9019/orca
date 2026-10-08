import { afterEach, expect, it, vi } from 'vitest'
import { copyArtifactLink, openArtifactInBrowser } from './artifact-link-actions'
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
afterEach(() => vi.unstubAllGlobals())
it('waits for native link requests and reports clipboard and browser failures', async () => {
  const writeClipboardText = vi.fn().mockResolvedValue(undefined)
  let finish: (() => void) | undefined
  const openUrl = vi.fn().mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve
    })
  )
  vi.stubGlobal('window', { api: { ui: { writeClipboardText }, shell: { openUrl } } })
  const url = 'https://example.com/a/fixture'
  await expect(copyArtifactLink(url)).resolves.toBe(true)
  expect(writeClipboardText).toHaveBeenCalledExactlyOnceWith(url)
  const complete = vi.fn()
  const pending = openArtifactInBrowser(url).then(complete)
  await Promise.resolve()
  expect(complete).not.toHaveBeenCalled()
  finish?.()
  await pending
  expect(complete).toHaveBeenCalledWith(true)
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(url)
  writeClipboardText.mockRejectedValueOnce(new Error('fixture-secret'))
  openUrl.mockRejectedValueOnce(new Error('fixture-secret'))
  await expect(copyArtifactLink(url)).resolves.toBe(false)
  await expect(openArtifactInBrowser(url)).resolves.toBe(false)
})
