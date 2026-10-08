import type { ClientHostRouteIdentity } from '../../src/main/browser/paired-runtime-browser-client-host-runtime'
import { cookieFixture } from './browser-settings-cookie.fixture'
import { browserImportHintCookieOwnerFixture } from './browser-import-hint-cookie-owner.fixture'
import { browserPageInteractionAndSessionsApi } from '../../src/preload/api/browser-bridge-page-interaction-and-sessions'
import { registerBrowserSessionProfileHandlers } from '../../src/main/ipc/browser-session-profile-ipc'
import { setTrustedBrowserRendererWebContentsId } from '../../src/main/ipc/browser-renderer-trust'
import { resetClientRouteCookieImportSourcesForTests } from '../../src/main/browser/client-route-cookie-import-source-store'
import { browserSessionRegistry } from '../../src/main/browser/browser-session-registry'
import { clearRuntimeCompatibilityCacheForTests } from '../../src/renderer/src/runtime/runtime-rpc-client'
import { useAppStore } from '../../src/renderer/src/store'
import { okFixture } from '../../src/cli/test-fixtures'
import { act } from 'react'
import { vi } from 'vitest'
const clientHostState = vi.hoisted(() => ({
  identities: new Map<string, ClientHostRouteIdentity>()
}))
export const clientHostFixture = clientHostState
vi.mock('../../src/main/browser/paired-runtime-browser-client-host-runtime', () => ({
  getPairedRuntimeBrowserClientRouteIdentity: (id: string) =>
    clientHostState.identities.get(id) ?? null
}))
export async function browserImportClientHostOwnerFixture() {
  const fixture = await browserImportHintCookieOwnerFixture()
  cookieFixture.ipcHandlers.clear()
  cookieFixture.ipcEvents.length = 0
  cookieFixture.sender.id = 42
  clientHostState.identities.clear()
  clientHostState.identities.set('remote', {
    orcaProfileId: 'hint-file-fixture',
    authorityConnectionIdentity: 'paired-runtime:fixture-authority',
    executionHostIdentity: 'fixture-client-host',
    legacyAuthorityConnectionIdentity: 'paired-runtime:fixture-legacy',
    legacyExecutionHostIdentity: 'fixture-legacy-host',
    storageScope: 'e'.repeat(64)
  })
  clearRuntimeCompatibilityCacheForTests()
  resetClientRouteCookieImportSourcesForTests()
  setTrustedBrowserRendererWebContentsId(42)
  registerBrowserSessionProfileHandlers()
  Object.assign(window.api.browser, browserPageInteractionAndSessionsApi)
  Object.assign(window.api, {
    runtimeEnvironments: {
      call: async ({ method }: { method: string }) => {
        if (method === 'status.get') {
          return okFixture('remote-status', fixture.owner.runtime.getStatus())
        }
        if (method === 'browser.profileList') {
          return okFixture('remote-profiles', { profiles: browserSessionRegistry.listProfiles() })
        }
        throw new Error('Unexpected fixture remote call')
      }
    }
  })
  await act(async () => {
    const state = useAppStore.getState()
    useAppStore.setState({
      settings: state.settings ? { ...state.settings, activeRuntimeEnvironmentId: 'remote' } : null,
      browserPagesByWorkspace: {
        tab: state.browserPagesByWorkspace.tab.map((page) => ({
          ...page,
          browserRuntimeEnvironmentId: 'remote'
        }))
      }
    })
  })
  return {
    ...fixture,
    close: async () => {
      setTrustedBrowserRendererWebContentsId(null)
      clientHostState.identities.clear()
      await fixture.owner.close()
    }
  }
}
