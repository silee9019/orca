// @vitest-environment happy-dom
import { mount, target, guest } from './browser-client-command.test-fixture'
import { act } from '@testing-library/react'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { flushSync } from 'react-dom'
import { useAppStore } from '@/store'
import { applyBrowserClientDocumentRequest } from '@/runtime/browser-client-document-request'
const destination = 'folder:other'
const path = join(tmpdir(), 'client-document-other', 'fixture.html')
function installFolders() {
  Object.assign(window.api.browser, {
    notifyActiveTabChanged: vi.fn().mockResolvedValue(undefined)
  })
  useAppStore.setState({
    folderWorkspaces: ['fixture', 'other'].map((id) => ({
      id,
      projectGroupId: 'fixture',
      name: id,
      folderPath: join(
        tmpdir(),
        id === 'other' ? 'client-document-other' : 'client-document-folder'
      ),
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
    }))
  })
}
it('observes the existing address route opening the document in its owning worktree', async () => {
  installFolders()
  mount(true, () => target.worktreeId, true)
  let result: unknown
  await act(async () => {
    result = await applyBrowserClientDocumentRequest(
      {
        viewer: 'host',
        operation: 'client-document',
        entry: 'address-bar',
        target,
        value: path,
        documentWorktreeId: destination
      },
      Date.now() + 5000
    )
  })
  expect(result).toMatchObject({
    clientDocument: {
      ...target,
      accepted: true,
      conversion: 'opened-in-owning-worktree',
      documentWorktreeId: destination,
      filePath: path
    }
  })
  const state = useAppStore.getState()
  expect(state.activeWorktreeId).toBe(destination)
  expect(
    (
      state.browserPagesByWorkspace[state.activeBrowserTabIdByWorktree[destination] ?? ''] ?? []
    ).find((page) => page.docLocation?.filePath === path)
  ).toBeDefined()
  expect(guest.loadURL).not.toHaveBeenCalled()
})

function requestDocument(documentWorktreeId: string | undefined) {
  return applyBrowserClientDocumentRequest(
    {
      viewer: 'host',
      operation: 'client-document',
      entry: 'address-bar',
      target,
      value: path,
      ...(documentWorktreeId ? { documentWorktreeId } : {})
    },
    Date.now() + 5000
  )
}
it.each([undefined, 'folder:wrong'])(
  'refuses a cross-worktree path without its exact destination selector (%s)',
  async (selected) => {
    installFolders()
    mount()
    const convert = vi.spyOn(useAppStore.getState(), 'convertBrowserPage')
    try {
      await expect(requestDocument(selected)).rejects.toThrow('input_unsupported')
      expect(convert).not.toHaveBeenCalled()
      expect(useAppStore.getState().activeWorktreeId).toBe(target.worktreeId)
    } finally {
      convert.mockRestore()
    }
  }
)
it('activates an already open document in the explicitly selected owning worktree', async () => {
  installFolders()
  const existing = useAppStore.getState().createBrowserTab(destination, '', {
    docLocation: { kind: 'workspace-doc', worktreeId: destination, filePath: path },
    browserRuntimeEnvironmentId: null
  })
  useAppStore.getState().setActiveWorktree(target.worktreeId)
  mount(true, () => target.worktreeId, true)
  let result: unknown
  await act(async () => {
    result = await requestDocument(destination)
  })
  expect(result).toMatchObject({
    clientDocument: {
      conversion: 'activated-existing',
      documentWorktreeId: destination,
      documentWorkspaceId: existing.id
    }
  })
})
it('allows the intended source Pane deactivation while retaining the observer until destination readback', async () => {
  installFolders()
  mount(
    (id) => id === target.worktreeId,
    () => target.worktreeId,
    true
  )
  const unsubscribe = useAppStore.subscribe((state) => {
    if (state.activeWorktreeId === destination) {
      flushSync(() => {})
    }
  })
  let result: unknown
  try {
    await act(async () => {
      result = await requestDocument(destination)
    })
    expect(result).toMatchObject({
      clientDocument: { accepted: true, documentWorktreeId: destination }
    })
  } finally {
    unsubscribe()
  }
})
it.each(['folder:foreign', target.worktreeId])(
  'refuses %s ABA after the intended owning-worktree switch',
  async (foreign) => {
    installFolders()
    mount(
      (id) => id === target.worktreeId,
      () => target.worktreeId,
      true
    )
    let injected = false
    const unsubscribe = useAppStore.subscribe((state) => {
      if (!injected && state.activeWorktreeId === destination) {
        injected = true
        flushSync(() => {})
        useAppStore.setState({ activeWorktreeId: foreign })
        useAppStore.setState({ activeWorktreeId: destination })
      }
    })
    try {
      await act(async () => {
        await expect(requestDocument(destination)).rejects.toThrow('effect_unknown')
      })
      expect(injected).toBe(true)
    } finally {
      unsubscribe()
    }
  }
)
