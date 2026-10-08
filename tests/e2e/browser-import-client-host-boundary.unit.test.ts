// @vitest-environment happy-dom
import { cookieFixture } from './browser-settings-cookie.fixture'
import {
  browserImportClientHostOwnerFixture,
  clientHostFixture
} from './browser-import-client-host-owner.fixture'
import { resetClientRouteCookieImportSourcesForTests } from '../../src/main/browser/client-route-cookie-import-source-store'
import { useAppStore } from '../../src/renderer/src/store'
import { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
let fixture: Awaited<ReturnType<typeof browserImportClientHostOwnerFixture>> | undefined
afterEach(async () => {
  await fixture?.close()
  fixture = undefined
  cookieFixture.sender.id = 42
  cookieFixture.sender.isDestroyed = () => false
  cookieFixture.sender.getType = () => 'window'
})
it.each(['replaced', 'disconnected'])(
  'does not acknowledge a client route %s during a held native-provider fixture',
  async (change) => {
    fixture = await browserImportClientHostOwnerFixture()
    let release = (): void => {}
    cookieFixture.wait = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = fixture.owner.invoke('import-browser', [
      '--host',
      'runtime:remote',
      '--browser',
      'chrome',
      '--confirm-profile',
      'default'
    ])
    const rejected = expect(pending).rejects.toThrow()
    await vi.waitFor(() =>
      expect(useAppStore.getState().browserSessionImportState?.status).toBe('importing')
    )
    const identity = clientHostFixture.identities.get('remote')
    if (!identity) {
      throw new Error('fixture route missing')
    }
    if (change === 'replaced') {
      clientHostFixture.identities.set('remote', {
        ...identity,
        authorityConnectionIdentity: 'paired-runtime:replacement'
      })
    } else {
      clientHostFixture.identities.delete('remote')
    }
    await act(async () => {
      release()
    })
    await rejected
    expect(cookieFixture.jars.size).toBe(1)
    resetClientRouteCookieImportSourcesForTests()
    expect(
      await window.api.browser.sessionClientRouteImportSources({ environmentId: 'remote' })
    ).toEqual({})
    expect(fixture.owner.output).not.toHaveBeenCalled()
  }
)
it.each(['other-window', 'destroyed', 'webview'])(
  'rejects %s at the actual trusted IPC boundary before an import',
  async (sender) => {
    fixture = await browserImportClientHostOwnerFixture()
    if (sender === 'other-window') {
      cookieFixture.sender.id = 99
    }
    if (sender === 'destroyed') {
      cookieFixture.sender.isDestroyed = () => true
    }
    if (sender === 'webview') {
      cookieFixture.sender.getType = () => 'webview'
    }
    await expect(
      fixture.owner.invoke('import-browser', [
        '--host',
        'runtime:remote',
        '--browser',
        'chrome',
        '--confirm-profile',
        'default'
      ])
    ).rejects.toThrow()
    expect(
      await window.api.browser.sessionDetectBrowsersForClientHost({ environmentId: 'remote' })
    ).toEqual([])
    expect(
      await window.api.browser.sessionClientRouteImportSources({ environmentId: 'remote' })
    ).toEqual({})
    expect(cookieFixture.jars.size).toBe(0)
    expect(fixture.owner.output).not.toHaveBeenCalled()
  }
)
it('returns the original null fallback signal when this desktop has no client route', async () => {
  fixture = await browserImportClientHostOwnerFixture()
  clientHostFixture.identities.delete('remote')
  expect(
    await window.api.browser.sessionDetectBrowsersForClientHost({ environmentId: 'remote' })
  ).toBeNull()
  expect(
    await window.api.browser.sessionImportFromBrowserForClientHost({
      environmentId: 'remote',
      profileId: 'default',
      browserFamily: 'chrome'
    })
  ).toBeNull()
  expect(cookieFixture.jars.size).toBe(0)
})
