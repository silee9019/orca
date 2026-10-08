// @vitest-environment happy-dom
import { cookieFixture } from './browser-settings-cookie.fixture'
import { browserImportHintCookieOwnerFixture } from './browser-import-hint-cookie-owner.fixture'
import { browserSessionRegistry } from '../../src/main/browser/browser-session-registry'
import { toast } from 'sonner'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../../src/main/browser/browser-cookie-staged-import', async () =>
  (await import('./browser-cookie-staged-import.fixture')).browserCookieStagedImportStub()
)
let fixture: Awaited<ReturnType<typeof browserImportHintCookieOwnerFixture>> | undefined
afterEach(async () => {
  await fixture?.owner.close()
  fixture = undefined
})
it('reuses the actual hint browser import callback, provider selection and metadata update', async () => {
  fixture = await browserImportHintCookieOwnerFixture()
  const success = vi.spyOn(toast, 'success')
  cookieFixture.browsers[0].profiles.push({ directory: 'Profile 2', name: 'Second Profile' })
  await fixture.owner.invoke('open')
  await fixture.owner.invoke('import-browser', [
    '--browser',
    'chrome',
    '--source-profile',
    'Profile 2',
    '--confirm-profile',
    'default'
  ])
  const profile = browserSessionRegistry.getProfile('default')
  if (!profile) {
    throw new Error('fixture profile missing')
  }
  expect(cookieFixture.jars.get(profile.partition)).toBe('private-fixture-browser-cookie')
  expect(profile.source?.browserFamily).toBe('chrome')
  expect(profile.source?.profileName).toBe('Second Profile')
  expect(fixture.owner.store.getUI().featureInteractions['cookie-import']?.interactionCount).toBe(1)
  expect(success).toHaveBeenCalledTimes(1)
  expect(document.querySelector('[data-import-hint-content]')).toBeNull()
  expect(fixture.owner.output.mock.calls.flat().join(' ')).not.toContain(
    'private-fixture-browser-cookie'
  )
})
it.each([
  ['--browser', 'missing-browser', '--confirm-profile', 'default'],
  ['--browser', 'chrome', '--source-profile', '../private', '--confirm-profile', 'default'],
  ['--browser', 'chrome', '--confirm-profile', 'other'],
  ['--browser', 'chrome', '--source-profile', '--confirm-profile', 'default']
])(
  'rejects invalid browser/profile selection without importing or public output: %j',
  async (flags) => {
    fixture = await browserImportHintCookieOwnerFixture()
    const success = vi.spyOn(toast, 'success')
    await expect(fixture.owner.invoke('import-browser', flags)).rejects.toThrow()
    expect(cookieFixture.jars.size).toBe(0)
    expect(success).not.toHaveBeenCalled()
    expect(fixture.owner.output).not.toHaveBeenCalled()
  }
)
it('uses the existing default browser-profile selection when none is specified', async () => {
  fixture = await browserImportHintCookieOwnerFixture()
  await fixture.owner.invoke('import-browser', [
    '--browser',
    'chrome',
    '--confirm-profile',
    'default'
  ])
  expect(browserSessionRegistry.getProfile('default')?.source?.profileName).toBe('Fixture Profile')
  expect(cookieFixture.jars.size).toBe(1)
})
