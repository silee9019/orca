// @vitest-environment happy-dom
import { mount, target, guest, finishLoad } from './browser-client-command.test-fixture'
import { act } from '@testing-library/react'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { applyBrowserClientSubmissionRequest } from '@/runtime/browser-client-submission-request'
it('uses the configured search resolver and actual mounted navigation metadata owner', async () => {
  useAppStore.setState({ browserDefaultSearchEngine: 'duckduckgo' })
  mount()
  let pending: ReturnType<typeof applyBrowserClientSubmissionRequest> | undefined
  await act(async () => {
    pending = applyBrowserClientSubmissionRequest(
      {
        viewer: 'host',
        operation: 'client-submission',
        entry: 'address-bar',
        target,
        value: 'orca cli search'
      },
      Date.now() + 5000
    )
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing request')
  }
  expect(guest.loadURL).toHaveBeenCalledWith('https://duckduckgo.com/?q=orca%20cli%20search')
  await act(async () => finishLoad())
  expect(await pending).toMatchObject({
    clientSubmission: {
      ...target,
      url: 'https://duckduckgo.com/?q=orca%20cli%20search',
      accepted: true,
      loading: false
    }
  })
})
it.each([
  'javascript:alert(1)',
  'data:text/plain,fixture',
  'file:///fixture.html',
  'https://user:fixture-password@example.test/'
])('refuses unsupported web input without invoking the guest', async (value) => {
  mount()
  await expect(
    applyBrowserClientSubmissionRequest(
      { viewer: 'host', operation: 'client-submission', entry: 'address-bar', target, value },
      Date.now() + 5000
    )
  ).rejects.toThrow('web_input_required')
  expect(guest.loadURL).not.toHaveBeenCalled()
})
it('preserves exact-one mounted owner arbitration', async () => {
  mount()
  mount()
  await expect(
    applyBrowserClientSubmissionRequest(
      {
        viewer: 'host',
        operation: 'client-submission',
        entry: 'address-bar',
        target,
        value: 'orca cli search'
      },
      Date.now() + 5000
    )
  ).rejects.toThrow('owner_ambiguous')
  expect(guest.loadURL).not.toHaveBeenCalled()
})
it('refuses staged pages instead of claiming deferred navigation completion', async () => {
  useAppStore.setState((state) => ({
    remoteBrowserPageHandlesByPageId: {
      ...state.remoteBrowserPageHandlesByPageId,
      [target.page]: { ...state.remoteBrowserPageHandlesByPageId[target.page], staged: true }
    }
  }))
  mount()
  await expect(
    applyBrowserClientSubmissionRequest(
      {
        viewer: 'host',
        operation: 'client-submission',
        entry: 'address-bar',
        target,
        value: 'orca cli search'
      },
      Date.now() + 5000
    )
  ).rejects.toThrow('target_unavailable')
  expect(guest.loadURL).not.toHaveBeenCalled()
})

it('refuses a real folder workspace document route without converting the browser page', async () => {
  useAppStore.setState({
    folderWorkspaces: [
      {
        id: 'fixture',
        projectGroupId: 'fixture',
        name: 'Fixture',
        folderPath: join(tmpdir(), 'client-submit-folder'),
        connectionId: 'ssh-fixture',
        linkedTask: null,
        comment: '',
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: 0,
        lastActivityAt: 0,
        createdAt: 0,
        updatedAt: 0
      }
    ]
  })
  mount()
  await expect(
    applyBrowserClientSubmissionRequest(
      {
        viewer: 'host',
        operation: 'client-submission',
        entry: 'address-bar',
        target,
        value: './fixture.html'
      },
      Date.now() + 5000
    )
  ).rejects.toThrow('document_unsupported')
  expect(guest.loadURL).not.toHaveBeenCalled()
  expect(
    Object.values(useAppStore.getState().browserPagesByWorkspace)
      .flat()
      .find((page) => page.id === target.page)
  ).not.toHaveProperty('docLocation')
})
