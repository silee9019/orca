// @vitest-environment happy-dom
import { cookieFixture } from './browser-settings-cookie.fixture'
import { browserImportClientHostOwnerFixture } from './browser-import-client-host-owner.fixture'
import { browserSessionRegistry } from '../../src/main/browser/browser-session-registry'
import { useAppStore } from '../../src/renderer/src/store'
import { currentBrowserRoutePartitionBindingStore } from '../../src/main/browser/browser-route-partition-binding-runtime'
import { resetClientRouteCookieImportSourcesForTests } from '../../src/main/browser/client-route-cookie-import-source-store'
import { afterEach, expect, it } from 'vitest'
let fixture: Awaited<ReturnType<typeof browserImportClientHostOwnerFixture>> | undefined
afterEach(async () => {
  await fixture?.close()
  fixture = undefined
})
it('uses all three actual preload/IPC client-host APIs and reads the route jar and source overlay', async () => {
  fixture = await browserImportClientHostOwnerFixture()
  await fixture.owner.invoke('open', ['--host', 'runtime:remote'])
  await fixture.owner.invoke('import-browser', [
    '--host',
    'runtime:remote',
    '--browser',
    'chrome',
    '--confirm-profile',
    'default'
  ])
  expect(cookieFixture.ipcEvents).toEqual(
    expect.arrayContaining([
      'browser:session:detectBrowsersForClientHost',
      'browser:session:importFromBrowserForClientHost',
      'browser:session:clientRouteImportSources'
    ])
  )
  expect(cookieFixture.jars.size).toBe(1)
  const partition = Array.from(cookieFixture.jars.keys())[0]
  if (!partition) {
    throw new Error('fixture route jar missing')
  }
  expect(partition).toMatch(/^persist:orca-browser-v1-[a-f0-9]{64}$/)
  expect(currentBrowserRoutePartitionBindingStore().get(partition)).toMatch(/^[a-f0-9]{64}$/)
  expect(cookieFixture.jars.get(partition)).toBe('private-fixture-browser-cookie')
  resetClientRouteCookieImportSourcesForTests()
  expect(
    await window.api.browser.sessionClientRouteImportSources({ environmentId: 'remote' })
  ).toMatchObject({ default: { browserFamily: 'chrome', profileName: 'Fixture Profile' } })
  expect(fixture.owner.store.getUI().featureInteractions['cookie-import']).toBeUndefined()
  const local = browserSessionRegistry.getProfile('default')
  if (!local) {
    throw new Error('fixture profile missing')
  }
  expect(cookieFixture.jars.has(local.partition)).toBe(false)
  expect(local.source).toBeNull()
  expect(
    useAppStore.getState().browserSessionProfiles.find((profile) => profile.id === 'default')
      ?.source?.browserFamily
  ).toBe('chrome')
  expect(fixture.owner.output.mock.calls.flat().join(' ')).not.toContain(
    'private-fixture-browser-cookie'
  )
})
