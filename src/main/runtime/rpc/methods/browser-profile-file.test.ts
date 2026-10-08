import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  imported: vi.fn(),
  source: vi.fn(),
  getProfile: vi.fn()
}))
vi.mock('../../../browser/browser-session-registry', () => ({
  browserSessionRegistry: { getProfile: fixture.getProfile, updateProfileSource: fixture.source }
}))
vi.mock('../../../browser/browser-cookie-import', () => ({
  importCookiesFromFile: fixture.imported
}))

import { BrowserProfileImportFile } from '../../../../shared/rpc-contract/browser-profile-file-params'
import { importBrowserProfileCookieFile } from './browser-profile-file'

beforeEach(() => {
  vi.clearAllMocks()
  fixture.getProfile.mockReturnValue({ partition: 'persist:file-fixture' })
  fixture.imported.mockResolvedValue({
    ok: true,
    profileId: 'old',
    summary: {
      totalCookies: 1,
      importedCookies: 1,
      skippedCookies: 0,
      domains: ['fixture.invalid']
    }
  })
})

it('imports the selected host file into the requested profile and records its source', async () => {
  const params = BrowserProfileImportFile.parse({
    profileId: 'p1',
    filePath: join(tmpdir(), 'fixture-cookies.json')
  })
  const result = await importBrowserProfileCookieFile(params)
  expect(result).toMatchObject({ ok: true, profileId: 'p1', summary: { importedCookies: 1 } })
  expect(fixture.imported).toHaveBeenCalledExactlyOnceWith(params.filePath, 'persist:file-fixture')
  expect(fixture.source).toHaveBeenCalledExactlyOnceWith('p1', {
    browserFamily: 'manual',
    importedAt: expect.any(Number)
  })
})

it('refuses relative paths and unknown profiles before reading a cookie file', async () => {
  expect(
    await importBrowserProfileCookieFile({ profileId: 'p1', filePath: 'cookies.json' })
  ).toMatchObject({ ok: false })
  expect(fixture.getProfile).not.toHaveBeenCalled()
  fixture.getProfile.mockReturnValue(undefined)
  expect(
    await importBrowserProfileCookieFile({
      profileId: 'unknown',
      filePath: join(tmpdir(), 'cookies.json')
    })
  ).toEqual({ ok: false, reason: 'Session profile not found.' })
  expect(fixture.imported).not.toHaveBeenCalled()
})

it('preserves import failure and leaves source metadata unchanged', async () => {
  fixture.imported.mockResolvedValue({ ok: false, reason: 'File is not valid JSON.' })
  expect(
    await importBrowserProfileCookieFile({
      profileId: 'p1',
      filePath: join(tmpdir(), 'cookies.json')
    })
  ).toEqual({ ok: false, reason: 'File is not valid JSON.' })
  expect(fixture.source).not.toHaveBeenCalled()
})
