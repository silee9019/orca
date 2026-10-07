// @vitest-environment happy-dom
import { useSyncExternalStore } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { requestBrowserProfileUi } from '@/runtime/browser-profile-ui-request'
import type {
  BrowserProfileUiCommand,
  BrowserProfileUiState
} from '../../../../../shared/rpc-contract/browser-profile-ui-params'
import { BrowserToolbarMenu } from './BrowserToolbarMenu'
const fixture = vi.hoisted(() => {
  const emptyProfile = (): string | null => null
  const order: string[] = []
  const initial = () => ({
    browserTabsByWorktree: {
      folder: [
        { id: 'workspace', sessionProfileId: emptyProfile(), sessionPartition: 'partition-default' }
      ]
    },
    browserSessionProfiles: [
      { id: 'default', label: 'Default', partition: 'partition-default' },
      { id: 'other', label: 'Other', partition: 'partition-other' }
    ],
    detectedBrowsers: [],
    browserSessionImportState: null,
    activeContextualTourId: null,
    activeContextualTourStepIndex: 0,
    browserImportHintHidden: false,
    persistedUIReady: true
  })
  return {
    state: initial(),
    initial,
    listeners: new Set<() => void>(),
    order,
    create: vi.fn(),
    destroy: vi.fn()
  }
})
function notify() {
  for (const listener of fixture.listeners) {
    listener()
  }
}
const actions = {
  switchBrowserTabProfile: (workspace: string, profile: string | null, partition: string) => {
    fixture.order.push(`switch:${workspace}:${profile}`)
    fixture.state = {
      ...fixture.state,
      browserTabsByWorktree: {
        folder: [{ id: workspace, sessionProfileId: profile, sessionPartition: partition }]
      }
    }
    notify()
  },
  createBrowserSessionProfile: async (kind: string, name: string) => {
    const profile = await fixture.create(kind, name)
    if (profile) {
      fixture.state = {
        ...fixture.state,
        browserSessionProfiles: [...fixture.state.browserSessionProfiles, profile]
      }
      notify()
    }
    return profile
  },
  importCookiesFromBrowser: vi.fn(),
  importCookiesToProfile: vi.fn(),
  fetchDetectedBrowsers: vi.fn(),
  setBrowserPageViewportPreset: vi.fn()
}
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof fixture.state & typeof actions) => unknown) => {
    const state = useSyncExternalStore(
      (listener) => {
        fixture.listeners.add(listener)
        return () => {
          fixture.listeners.delete(listener)
        }
      },
      () => fixture.state
    )
    return selector({ ...state, ...actions })
  }
}))
vi.mock('./browser-toolbar-menu-dropdown', () => ({ BrowserToolbarMenuDropdown: () => null }))
vi.mock('./browser-toolbar-profile-dialogs', () => ({ BrowserToolbarProfileDialogs: () => null }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
beforeEach(() => {
  fixture.state = fixture.initial()
  fixture.order = []
  vi.clearAllMocks()
  fixture.create.mockResolvedValue({
    id: 'created',
    label: 'New session',
    partition: 'partition-created'
  })
  fixture.destroy.mockImplementation(() => fixture.order.push('destroy'))
})
afterEach(cleanup)
function Owner({ active = true }: { active?: boolean }) {
  const state = useSyncExternalStore(
    (listener) => {
      fixture.listeners.add(listener)
      return () => {
        fixture.listeners.delete(listener)
      }
    },
    () => fixture.state
  )
  return (
    <BrowserToolbarMenu
      currentProfileId={state.browserTabsByWorktree.folder[0].sessionProfileId}
      workspaceId="workspace"
      browserPageId="page"
      viewportPresetId={null}
      onDestroyWebview={fixture.destroy}
      isActive={active}
      overflow={{
        triggerRef: { current: null },
        tools: [],
        deferUntilClose: (action) => action(),
        onMenuCloseAutoFocus: vi.fn()
      }}
    />
  )
}
async function command(command: BrowserProfileUiCommand) {
  let response: Promise<BrowserProfileUiState> | undefined
  await act(async () => {
    response = requestBrowserProfileUi('page', command, Date.now() + 5000)
    void response.catch(() => {})
  })
  if (!response) {
    throw new Error('missing profile response')
  }
  return response
}
it('uses original menu selection/confirmation and destroys before profile/partition store update', async () => {
  render(<Owner />)
  expect(await command({ action: 'menu-open' })).toMatchObject({ menuOpen: true })
  expect(await command({ action: 'select', profile: 'other' })).toMatchObject({
    pendingProfile: 'other',
    profile: 'default'
  })
  expect(fixture.destroy).not.toHaveBeenCalled()
  expect(await command({ action: 'switch-cancel' })).toMatchObject({ pendingProfile: null })
  await command({ action: 'select', profile: 'other' })
  expect(await command({ action: 'switch-confirm' })).toMatchObject({
    profile: 'other',
    partition: 'partition-other',
    guestRegistrationVerified: false
  })
  expect(fixture.order).toEqual(['destroy', 'switch:workspace:other'])
  expect(await command({ action: 'menu-close' })).toMatchObject({ menuOpen: false })
})
it('uses original create flow with trimmed name, dialog reset and selected created partition', async () => {
  render(<Owner />)
  await command({ action: 'new-open' })
  await expect(command({ action: 'new-name', name: 'x'.repeat(51) })).rejects.toThrow(
    'browser_profile_name_too_long'
  )
  await command({ action: 'new-name', name: '  New session  ' })
  let result: Promise<BrowserProfileUiState> | undefined
  await act(async () => {
    result = requestBrowserProfileUi('page', { action: 'new-create' }, Date.now() + 5000)
    void result.catch(() => {})
  })
  await expect(result).resolves.toMatchObject({
    profile: 'created',
    partition: 'partition-created',
    newDialogOpen: false,
    newName: '',
    creating: false
  })
  expect(fixture.create).toHaveBeenCalledWith('isolated', 'New session')
  expect(fixture.order).toEqual(['destroy', 'switch:workspace:created'])
})
it('rejects missing targets, missing draft and inactive owner before service or guest changes', async () => {
  const view = render(<Owner />)
  await expect(command({ action: 'select', profile: 'missing' })).rejects.toThrow(
    'browser_profile_not_found'
  )
  await expect(command({ action: 'switch-confirm' })).rejects.toThrow(
    'browser_profile_switch_not_pending'
  )
  await expect(command({ action: 'new-create' })).rejects.toThrow('browser_profile_name_required')
  view.rerender(<Owner active={false} />)
  await expect(command({ action: 'new-open' })).rejects.toThrow('browser_profile_ui_inactive')
  expect(fixture.create).not.toHaveBeenCalled()
  expect(fixture.destroy).not.toHaveBeenCalled()
})

it('keeps the draft after creation refusal without destroying or switching the guest', async () => {
  render(<Owner />)
  await command({ action: 'new-open' })
  await command({ action: 'new-name', name: 'New session' })
  fixture.create.mockResolvedValueOnce(null)
  let response: Promise<BrowserProfileUiState> | undefined
  await act(async () => {
    response = requestBrowserProfileUi('page', { action: 'new-create' }, Date.now() + 5000)
    void response.catch(() => {})
  })
  await expect(response).rejects.toThrow('browser_profile_ui_not_applied_effect_unknown')
  expect(await command({ action: 'status' })).toMatchObject({
    profile: 'default',
    newDialogOpen: true,
    newName: 'New session',
    creating: false
  })
  expect(fixture.destroy).not.toHaveBeenCalled()
  expect(await command({ action: 'new-cancel' })).toMatchObject({
    newDialogOpen: false,
    newName: ''
  })
})

it('cancels only the profile dialog while an already started create continues under the original owner', async () => {
  render(<Owner />)
  await command({ action: 'new-open' })
  await command({ action: 'new-name', name: 'New session' })
  let finishCreate: (profile: { id: string; label: string; partition: string }) => void = () => {
    throw new Error('create not started')
  }
  fixture.create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishCreate = resolve
      })
  )
  let creating: Promise<BrowserProfileUiState> | undefined
  await act(async () => {
    creating = requestBrowserProfileUi('page', { action: 'new-create' }, Date.now() + 5000)
    void creating.catch(() => {})
  })
  expect(await command({ action: 'new-cancel' })).toMatchObject({
    newDialogOpen: false,
    newName: '',
    creating: true
  })
  await expect(creating).rejects.toThrow('browser_profile_dialog_closed_create_effect_unknown')
  expect(fixture.destroy).not.toHaveBeenCalled()
  await act(async () =>
    finishCreate({ id: 'created', label: 'New session', partition: 'partition-created' })
  )
  expect(await command({ action: 'status' })).toMatchObject({ profile: 'created', creating: false })
  expect(fixture.order).toEqual(['destroy', 'switch:workspace:created'])
})

it('reports ownership loss without inventing service cancellation or a successful viewer update', async () => {
  const view = render(<Owner />)
  await command({ action: 'new-open' })
  await command({ action: 'new-name', name: 'New session' })
  let finishCreate: (profile: { id: string; label: string; partition: string }) => void = () => {
    throw new Error('create not started')
  }
  fixture.create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishCreate = resolve
      })
  )
  let creating: Promise<BrowserProfileUiState> | undefined
  await act(async () => {
    creating = requestBrowserProfileUi('page', { action: 'new-create' }, Date.now() + 5000)
    void creating.catch(() => {})
  })
  view.rerender(<Owner active={false} />)
  await expect(creating).rejects.toThrow('browser_profile_ui_inactive_effect_unknown')
  await act(async () =>
    finishCreate({ id: 'created', label: 'New session', partition: 'partition-created' })
  )
  expect(fixture.state.browserTabsByWorktree.folder[0].sessionProfileId).toBe('created')
  expect(fixture.order).toEqual(['destroy', 'switch:workspace:created'])
})
