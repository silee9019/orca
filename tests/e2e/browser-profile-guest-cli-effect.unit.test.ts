// @vitest-environment happy-dom
import { browserProfileGuestOwnerFixture } from './browser-profile-guest-owner.fixture'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '../../src/renderer/src/store'
import type { ComponentProps } from 'react'
import type { BrowserChromeToolbar } from '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-chrome-toolbar'
vi.mock('../../src/main/browser/browser-cookie-staged-import', async () =>
  (await import('./browser-cookie-staged-import.fixture')).browserCookieStagedImportStub()
)

vi.mock(
  '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-chrome-toolbar',
  () => ({
    BrowserChromeToolbar: ({
      overflowMenu
    }: Pick<ComponentProps<typeof BrowserChromeToolbar>, 'overflowMenu'>) =>
      overflowMenu?.({
        triggerRef: { current: null },
        tools: [],
        deferUntilClose: (action) => action(),
        onMenuCloseAutoFocus: () => {}
      })
  })
)
vi.mock(
  '../../src/renderer/src/components/browser-pane/assemble-chrome/use-browser-reload-menu-commands',
  () => ({ useBrowserReloadMenuCommands: () => {} })
)
vi.mock(
  '../../src/renderer/src/components/browser-pane/assemble-chrome/use-browser-toolbar-history-commands',
  () => ({ useBrowserToolbarHistoryCommands: () => {} })
)
let fixture: Awaited<ReturnType<typeof browserProfileGuestOwnerFixture>> | undefined
afterEach(async () => {
  await fixture?.close()
  fixture = undefined
})
it('runs the actual parent guest-destroy callback before profile switch/create Store read-back', async () => {
  fixture = await browserProfileGuestOwnerFixture()
  const untouched = fixture.installGuest('untouched')
  const old = fixture.installGuest('page')
  await fixture.invoke('select', ['--profile', fixture.other.id])
  expect(old.isConnected).toBe(true)
  expect(fixture.unregisterGuest).not.toHaveBeenCalled()
  await fixture.invoke('switch-confirm', ['--confirm'])
  expect(old.isConnected).toBe(false)
  expect(fixture.webviewRegistry.has('page')).toBe(false)
  expect(useAppStore.getState().browserTabsByWorktree.work?.[0]).toMatchObject({
    sessionProfileId: fixture.other.id,
    sessionPartition: fixture.other.partition
  })
  expect(fixture.unregisterGuest).toHaveBeenCalledExactlyOnceWith({ browserPageId: 'page' })
  expect(untouched.isConnected).toBe(true)
  expect(fixture.webviewRegistry.has('untouched')).toBe(true)
  const replacement = fixture.installGuest('page')
  await fixture.invoke('new-open')
  await fixture.invoke('new-name', ['--name', 'Created'])
  await fixture.invoke('new-create', ['--confirm'])
  const created = useAppStore
    .getState()
    .browserSessionProfiles.find((profile) => profile.label === 'Created')
  expect(created).toBeDefined()
  expect(fixture.createProfile).toHaveBeenCalledExactlyOnceWith({
    scope: 'isolated',
    label: 'Created'
  })
  expect(replacement.isConnected).toBe(false)
  expect(fixture.webviewRegistry.has('page')).toBe(false)
  expect(useAppStore.getState().browserTabsByWorktree.work?.[0]).toMatchObject({
    sessionProfileId: created?.id,
    sessionPartition: created?.partition
  })
  expect(untouched.isConnected).toBe(true)
  expect(fixture.unregisterGuest).toHaveBeenCalledTimes(2)
})
