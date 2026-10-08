// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { requestBrowserProfileUi } from '@/runtime/browser-profile-ui-request'
import { BrowserToolbarMenuDropdown } from './browser-toolbar-menu-dropdown'
import { BrowserToolbarMenu } from './BrowserToolbarMenu'
const fixture = vi.hoisted(() => {
  const initial = () => ({
    browserTabsByWorktree: {
      folder: [{ id: 'workspace', sessionProfileId: null, sessionPartition: null }]
    },
    browserSessionProfiles: [],
    detectedBrowsers: [],
    browserSessionImportState: null,
    activeContextualTourId: null,
    activeContextualTourStepIndex: 0,
    browserImportHintHidden: false,
    browserSessionHostIdOverride: 'local',
    persistedUIReady: true,
    activeModal: 'none',
    activeView: 'terminal',
    settingsNavigationTarget: { pane: 'general', repoId: null },
    settingsSearchQuery: 'old'
  })
  const order: string[] = []
  return { state: initial(), initial, order, refuse: false }
})
const actions = {
  switchBrowserTabProfile: vi.fn(),
  createBrowserSessionProfile: vi.fn(),
  fetchDetectedBrowsers: vi.fn(),
  setBrowserPageViewportPreset: vi.fn(),
  openSettingsTarget: (target: { pane: string; repoId: null }) => {
    fixture.order.push('target')
    if (!fixture.refuse) {
      fixture.state.settingsNavigationTarget = target
    }
  },
  openSettingsPage: () => {
    fixture.order.push('page')
    fixture.state.activeView = 'settings'
    fixture.state.settingsSearchQuery = ''
  }
}
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof fixture.state & typeof actions) => unknown) =>
      selector({ ...fixture.state, ...actions }),
    { getState: () => ({ ...fixture.state, ...actions }) }
  )
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./use-browser-toolbar-cookie-imports', () => ({
  useBrowserToolbarCookieImports: () => ({
    handleImportFromBrowser: vi.fn(),
    handleImportFromFile: vi.fn()
  })
}))
vi.mock('./browser-toolbar-profile-dialogs', () => ({ BrowserToolbarProfileDialogs: () => null }))
const snapshot = {
  workspace: 'workspace',
  profile: 'default',
  partition: null,
  menuOpen: true,
  pendingProfile: null,
  newDialogOpen: false,
  newName: '',
  creating: false,
  guestRegistrationVerified: false as const
}
const close = vi.fn()
function Menu({ active = true, page = 'page', open = true } = {}) {
  return (
    <BrowserToolbarMenuDropdown
      commandOwner={{ page, active, snapshot }}
      menuOpen={open}
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
}
beforeEach(() => {
  fixture.state = fixture.initial()
  fixture.order = []
  fixture.refuse = false
  close.mockClear()
})
afterEach(async () => {
  cleanup()
  await new Promise((resolve) => setTimeout(resolve, 0))
})
async function command() {
  let result
  await act(async () => {
    result = await requestBrowserProfileUi('page', { action: 'settings-open' }, Date.now() + 1000)
  })
  return result
}
it('reuses the actual settings menu selection and store outcome', async () => {
  render(<Menu />)
  const result = await command()
  expect(fixture.order).toEqual(['target', 'page'])
  expect(close).toHaveBeenCalledWith(false)
  expect(result).toMatchObject({
    settings: { activeView: 'settings', pane: 'browser', repoId: null, search: '' }
  })
})
it('preserves the original pointer selection', () => {
  render(<Menu />)
  fireEvent.click(screen.getByRole('menuitem', { name: 'Browser Settings…' }))
  expect(fixture.order).toEqual(['target', 'page'])
  expect(close).toHaveBeenCalledWith(false)
})
it.each(['inactive', 'different-page', 'closed', 'duplicate', 'modal', 'unready'])(
  'refuses %s before settings effects',
  async (kind) => {
    if (kind === 'modal') {
      fixture.state.activeModal = 'dialog'
    }
    if (kind === 'unready') {
      fixture.state.persistedUIReady = false
    }
    render(
      <Menu
        active={kind !== 'inactive'}
        page={kind === 'different-page' ? 'other' : 'page'}
        open={kind !== 'closed'}
      />
    )
    if (kind === 'duplicate') {
      render(<Menu />)
    }
    await expect(command()).rejects.toThrow()
    expect(fixture.order).toEqual([])
  }
)
it('does not report success when the settings target store refuses the action', async () => {
  fixture.refuse = true
  render(<Menu />)
  await expect(command()).rejects.toThrow('not_applied')
})

it('receives its exact page owner from the actual BrowserToolbarMenu parent', async () => {
  render(
    <BrowserToolbarMenu
      currentProfileId={null}
      workspaceId="workspace"
      browserPageId="page"
      viewportPresetId={null}
      onDestroyWebview={vi.fn()}
      isActive
      overflow={{
        tools: [],
        triggerRef: { current: null },
        deferUntilClose: vi.fn(),
        onMenuCloseAutoFocus: vi.fn()
      }}
    />
  )
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Browser menu' }), {
    button: 0,
    ctrlKey: false
  })
  expect(screen.getByRole('menuitem', { name: 'Browser Settings…' })).toBeTruthy()
  expect(await command()).toMatchObject({ workspace: 'workspace', settings: { pane: 'browser' } })
  expect(fixture.order).toEqual(['target', 'page'])
})
