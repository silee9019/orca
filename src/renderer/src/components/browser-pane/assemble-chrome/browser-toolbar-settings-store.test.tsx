// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { requestBrowserProfileUi } from '@/runtime/browser-profile-ui-request'
import { BrowserToolbarMenuDropdown } from './browser-toolbar-menu-dropdown'
const initial = useAppStore.getState()
afterEach(async () => {
  cleanup()
  await new Promise((resolve) => setTimeout(resolve, 0))
  useAppStore.setState(initial, true)
})
it('confirms the actual settings writers and store after the mounted menu selects settings', async () => {
  useAppStore.setState({
    persistedUIReady: true,
    activeModal: 'none',
    activeView: 'terminal',
    previousViewBeforeSettings: 'terminal',
    settingsNavigationTarget: { pane: 'general', repoId: null },
    settingsSearchInputQuery: 'old query',
    settingsSearchQuery: 'old query'
  })
  const close = vi.fn()
  render(
    <BrowserToolbarMenuDropdown
      commandOwner={{
        page: 'page',
        active: true,
        snapshot: {
          workspace: 'folder',
          profile: 'default',
          partition: null,
          menuOpen: true,
          pendingProfile: null,
          newDialogOpen: false,
          newName: '',
          creating: false,
          guestRegistrationVerified: false
        }
      }}
      menuOpen
      onMenuOpenChange={close}
      allProfiles={[]}
      effectiveProfileId="default"
      onSwitchProfile={vi.fn()}
      onNewProfile={vi.fn()}
      detectedBrowsers={[]}
      onFetchDetectedBrowsers={vi.fn()}
      browserSessionImportState={null}
      onImportFromBrowser={vi.fn()}
      onImportFromFile={vi.fn()}
      viewportPresetId={null}
      onApplyViewportPreset={vi.fn()}
      overflow={{
        tools: [],
        triggerRef: { current: null },
        deferUntilClose: vi.fn(),
        onMenuCloseAutoFocus: vi.fn()
      }}
    />
  )
  let receipt
  await act(async () => {
    receipt = await requestBrowserProfileUi('page', { action: 'settings-open' }, Date.now() + 1000)
  })
  const state = useAppStore.getState()
  expect(state.settingsNavigationTarget).toEqual({ pane: 'browser', repoId: null })
  expect(state.activeView).toBe('settings')
  expect(state.previousViewBeforeSettings).toBe('terminal')
  expect(state.settingsSearchQuery).toBe('')
  expect(state.settingsSearchInputQuery).toBe('')
  expect(close).toHaveBeenCalledWith(false)
  expect(receipt).toMatchObject({
    settings: { activeView: 'settings', pane: 'browser', repoId: null, search: '' }
  })
})
