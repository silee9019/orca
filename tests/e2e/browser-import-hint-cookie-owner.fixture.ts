import { cookieFixture } from './browser-settings-cookie.fixture'
import { browserImportHintOwnerSocketFixture } from './browser-import-hint-owner-socket.fixture'
import { browserSessionRegistry } from '../../src/main/browser/browser-session-registry'
import { BROWSER_PROFILE_FILE_METHODS } from '../../src/main/runtime/rpc/methods/browser-profile-file'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeBrowserCommandsWithBrowserProfileImportFromBrowser } from '../../src/main/runtime/runtime-browser-commands-browser-profile-import-from-browser'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi } from 'vitest'
vi.mock('../../src/main/browser/browser-session-partition-policies', () => ({
  installBrowserSessionPartitionPolicies: () => {},
  forgetBrowserSessionPartitionPolicies: () => {},
  applyBrowserSessionUserAgent: () => {}
}))
export async function browserImportHintCookieOwnerFixture() {
  const fixture = await browserImportHintOwnerSocketFixture()
  cookieFixture.directory = fixture.directory
  cookieFixture.jars.clear()
  cookieFixture.wait = Promise.resolve()
  cookieFixture.browsers = [
    {
      family: 'chrome',
      label: 'Fixture Chrome',
      selectedProfile: 'Default',
      profiles: [{ directory: 'Default', name: 'Fixture Profile' }]
    }
  ]
  browserSessionRegistry.configureForOrcaProfile({
    orcaProfileId: 'hint-file-fixture',
    profileDirectory: fixture.directory
  })
  const dispatcher = new RpcDispatcher({
    runtime: fixture.runtime,
    methods: BROWSER_PROFILE_FILE_METHODS
  })
  Object.assign(window.api, {
    runtime: {
      call: async ({ method, params }: { method: string; params: unknown }) =>
        dispatcher.dispatch({ id: 'file-owner', method, params })
    }
  })
  Object.assign(window.api.browser, {
    sessionListProfiles: async () => browserSessionRegistry.listProfiles(),
    sessionImportFromBrowser: async (
      params: Parameters<
        RuntimeBrowserCommandsWithBrowserProfileImportFromBrowser['browserProfileImportFromBrowser']
      >[0]
    ) =>
      RuntimeBrowserCommandsWithBrowserProfileImportFromBrowser.prototype.browserProfileImportFromBrowser(
        params
      )
  })
  const store = fixture.store
  Object.assign(window.api.ui, {
    recordFeatureInteraction: async (id: Parameters<typeof store.recordFeatureInteraction>[0]) =>
      store.recordFeatureInteraction(id)
  })
  const file = join(fixture.directory, 'cookies.json')
  writeFileSync(file, 'private-fixture-cookie-value')
  return { owner: fixture, file }
}
