import { afterEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => {
  const state: { source: unknown } = { source: null }
  return {
    state,
    cookies: ['old-cookie'],
    importedPartition: '',
    registry: {
      getProfile: (id: string) =>
        id === 'fixture-profile' ? { partition: 'persist:fixture-profile' } : undefined,
      updateProfileSource: (_id: string, source: unknown) => {
        fixture.state.source = source
      },
      clearDefaultSessionCookies: async () => {
        fixture.cookies = []
        return true
      }
    }
  }
})

vi.mock('./runtime-browser-commands-browser-tab-set-profile', () => ({
  RuntimeBrowserCommandsWithBrowserTabSetProfile: class {}
}))
vi.mock('../browser/browser-session-registry', () => ({
  browserSessionRegistry: fixture.registry
}))
vi.mock('../browser/browser-cookie-import', () => ({
  detectInstalledBrowsers: () => [
    {
      family: 'chrome',
      selectedProfile: 'Default',
      profiles: [{ directory: 'Default', name: 'Fixture' }]
    }
  ],
  selectBrowserProfile: () => null,
  importCookiesFromBrowser: async (_browser: unknown, partition: string) => {
    fixture.importedPartition = partition
    fixture.cookies = ['fixture-cookie']
    return {
      ok: true,
      profileId: 'fixture-profile',
      summary: {
        totalCookies: 1,
        importedCookies: 1,
        skippedCookies: 0,
        domains: ['fixture.invalid']
      }
    }
  }
}))

import { RuntimeBrowserCommandsWithBrowserProfileImportFromBrowser } from './runtime-browser-commands-browser-profile-import-from-browser'

const runtime = RuntimeBrowserCommandsWithBrowserProfileImportFromBrowser.prototype

afterEach(() => vi.restoreAllMocks())

it('existing profile service imports into the requested partition, records its source and clears cookies', async () => {
  const result = await runtime.browserProfileImportFromBrowser({
    profileId: 'fixture-profile',
    browserFamily: 'chrome'
  })
  expect(result).toMatchObject({
    ok: true,
    profileId: 'fixture-profile',
    summary: { importedCookies: 1 }
  })
  expect(fixture.importedPartition).toBe('persist:fixture-profile')
  expect(fixture.cookies).toEqual(['fixture-cookie'])
  expect(fixture.state.source).toEqual({
    browserFamily: 'chrome',
    profileName: 'Fixture',
    importedAt: expect.any(Number)
  })
  expect(await runtime.browserProfileClearDefaultCookies()).toEqual({ cleared: true })
  expect(fixture.cookies).toEqual([])
})
