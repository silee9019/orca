// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderOpenCodeAccountsSection } from '../components/settings/accounts-pane-provider-setting-sections'
import type { AccountsPaneSectionModel } from '../components/settings/accounts-pane-types'
import { applyMountedAccountsViewerAction } from './account-mounted-viewer-actions'
import { parseAccountMountedViewerAction } from '../../../shared/account-mounted-viewer-command'
vi.mock('../store', () => ({
  useAppStore: (select: (state: unknown) => unknown) =>
    select({ settings: null, settingsSearchQuery: '' })
}))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
it('commits the mounted draft through existing save/clear and analytics, with busy and failure protection', async () => {
  let stored = ''
  let finish: (() => void) | undefined
  const save = vi.fn(async (value: string) => {
    await new Promise<void>((resolve) => {
      finish = resolve
    })
    stored = value
    return { apiKeyConfigured: true }
  })
  const clear = vi.fn(async () => {
    stored = ''
    return { apiKeyConfigured: false }
  })
  const analytics = vi.fn()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      opencodeGoCredentials: {
        getStatus: vi.fn(async () => ({ apiKeyConfigured: false })),
        saveApiKey: save,
        clearApiKey: clear
      }
    }
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The section consumes only these OpenCode setting fields; credential IPC and analytics are explicit fixture callbacks.
  const model = {
    settings: { opencodeSessionCookie: '', opencodeWorkspaceId: '' },
    recordOpenCodeSettingEdit: analytics,
    updateSettings: vi.fn(),
    recordFeatureInteraction: vi.fn()
  } as unknown as AccountsPaneSectionModel
  const view = render(renderOpenCodeAccountsSection(model))
  await screen.findByText('Not saved')
  expect(() =>
    parseAccountMountedViewerAction({ type: 'account-opencode-go-commit', operation: 'save' })
  ).toThrow('Invalid mounted')
  await act(async () => {
    await applyMountedAccountsViewerAction({
      type: 'account-opencode-go-draft',
      value: ' fixture-private-key '
    })
  })
  let pending: Promise<unknown> | undefined
  await act(async () => {
    pending = applyMountedAccountsViewerAction({
      type: 'account-opencode-go-commit',
      operation: 'save',
      confirm: true
    })
  })
  const input = screen.getByLabelText('OpenCode Go API key')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Missing fixture credential input')
  }
  expect(input.disabled).toBe(true)
  await expect(
    applyMountedAccountsViewerAction({
      type: 'account-opencode-go-commit',
      operation: 'save',
      confirm: true
    })
  ).rejects.toThrow('busy')
  expect(save).toHaveBeenCalledExactlyOnceWith('fixture-private-key')
  await act(async () => {
    finish?.()
    await pending
  })
  expect(stored).toBe('fixture-private-key')
  expect(input.value).toBe('')
  expect(input.disabled).toBe(false)
  expect(screen.getByText('Saved')).toBeTruthy()
  expect(analytics).toHaveBeenCalledExactlyOnceWith('apiKey')
  await act(async () => {
    await applyMountedAccountsViewerAction({
      type: 'account-opencode-go-commit',
      operation: 'clear',
      confirm: true
    })
  })
  expect(stored).toBe('')
  expect(clear).toHaveBeenCalledTimes(1)
  expect(analytics).toHaveBeenCalledTimes(2)
  await act(async () => {
    await applyMountedAccountsViewerAction({
      type: 'account-opencode-go-draft',
      value: 'private-failure'
    })
  })
  save.mockRejectedValueOnce(new Error('private-failure'))
  await act(async () => {
    await expect(
      applyMountedAccountsViewerAction({
        type: 'account-opencode-go-commit',
        operation: 'save',
        confirm: true
      })
    ).rejects.toThrow('could not be applied')
  })
  expect(analytics).toHaveBeenCalledTimes(2)
  expect(input.disabled).toBe(false)
  expect(input.value).toBe('private-failure')
  view.unmount()
  await expect(
    applyMountedAccountsViewerAction({
      type: 'account-opencode-go-commit',
      operation: 'save',
      confirm: true
    })
  ).rejects.toThrow('unavailable')
})
