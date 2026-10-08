// @vitest-environment happy-dom
import { mount, target } from './browser-client-command.test-fixture'
import { act, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as historyOwner from './use-client-history-document-owner'
import { requestBrowserAddress } from '@/runtime/browser-address-request'
import { useAppStore } from '@/store'

afterEach(() => vi.restoreAllMocks())
it('keeps an absent history owner from becoming a generic address owner without placement', async () => {
  vi.spyOn(historyOwner, 'useClientHistoryDocumentOwner').mockReturnValue(undefined)
  mount(
    true,
    () => target.worktreeId,
    false,
    () => null
  )
  const input = screen.getByRole('combobox')
  const before = Reflect.get(input, 'value')
  await act(async () => {
    await expect(
      requestBrowserAddress(
        target.page,
        { action: 'draft', text: 'must-not-apply' },
        Date.now() + 2000
      )
    ).rejects.toThrow('browser_address_ui_unavailable')
  })
  expect(Reflect.get(input, 'value')).toBe(before)
  expect(useAppStore.getState().activeWorktreeId).toBe(target.worktreeId)
})
it.each(['unknown', 'restored'] as const)(
  'refuses generic address editing for a %s client handle without placement',
  async (kind) => {
    useAppStore.setState({
      remoteBrowserPageHandlesByPageId: {
        [target.page]: {
          environmentId: target.environmentId,
          remotePageId: target.remotePageId,
          ...(kind === 'restored'
            ? { staged: true, stagedClientHosted: true, restoredFromSession: true }
            : {})
        }
      }
    })
    mount(
      true,
      () => target.worktreeId,
      false,
      () => null
    )
    await expect(
      requestBrowserAddress(
        target.page,
        { action: 'draft', text: 'must-not-apply' },
        Date.now() + 2000
      )
    ).rejects.toThrow('browser_address_ui_unavailable')
    expect(useAppStore.getState().activeWorktreeId).toBe(target.worktreeId)
  }
)
