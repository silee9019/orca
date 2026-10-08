import { afterEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('electron', () => ({ ipcRenderer: { invoke: fixture.invoke } }))
import { shellApi } from './shell-bridge'
afterEach(() => fixture.invoke.mockReset())
it('sends the optional strict request through the existing native channel', async () => {
  fixture.invoke.mockResolvedValue({ opened: true })
  await expect(shellApi.openVerifiedUrl('https://example.test')).resolves.toEqual({ opened: true })
  expect(fixture.invoke).toHaveBeenCalledWith('shell:openUrl', 'https://example.test', {
    requireOpen: true
  })
})
it('does not accept an old main process void response', async () => {
  fixture.invoke.mockResolvedValue(undefined)
  await expect(shellApi.openVerifiedUrl('https://example.test')).rejects.toThrow(
    'external_url_open_unverifiable'
  )
})
it('preserves the existing UI void API without strict options', async () => {
  fixture.invoke.mockResolvedValue(undefined)
  await expect(shellApi.openUrl('https://example.test')).resolves.toBeUndefined()
  expect(fixture.invoke).toHaveBeenCalledWith('shell:openUrl', 'https://example.test')
})
