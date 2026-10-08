// @vitest-environment happy-dom
import { mount, target, placement, guest } from './browser-client-command.test-fixture'
import { act } from '@testing-library/react'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { flushSync } from 'react-dom'
import { useAppStore } from '@/store'
import { applyBrowserClientDocumentRequest } from '@/runtime/browser-client-document-request'
function installFolder(): void {
  Object.assign(window.api.browser, {
    notifyActiveTabChanged: vi.fn().mockResolvedValue(undefined)
  })
  useAppStore.setState({
    folderWorkspaces: [
      {
        id: 'fixture',
        projectGroupId: 'fixture',
        name: 'Fixture',
        folderPath: join(tmpdir(), 'client-document-folder'),
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
}
it('observes the actual ClientPane address conversion and authoritative document Store', async () => {
  installFolder()
  mount(true, () => target.worktreeId, true)
  let result: unknown
  await act(async () => {
    result = await applyBrowserClientDocumentRequest(
      {
        viewer: 'host',
        operation: 'client-document',
        entry: 'address-bar',
        target,
        value: './fixture.html'
      },
      Date.now() + 500
    )
  })
  expect(result).toMatchObject({
    clientDocument: {
      ...target,
      accepted: true,
      conversion: 'converted',
      documentWorktreeId: target.worktreeId,
      documentPageId: expect.any(String),
      filePath: join(tmpdir(), 'client-document-folder', 'fixture.html')
    }
  })
  expect(guest.loadURL).not.toHaveBeenCalled()
  expect(
    Object.values(useAppStore.getState().browserPagesByWorkspace)
      .flat()
      .find((page) => page.docLocation !== undefined)
  ).toMatchObject({
    docLocation: {
      kind: 'workspace-doc',
      worktreeId: target.worktreeId,
      filePath: join(tmpdir(), 'client-document-folder', 'fixture.html')
    }
  })
})

function requestDocument() {
  return applyBrowserClientDocumentRequest(
    {
      viewer: 'host',
      operation: 'client-document',
      entry: 'address-bar',
      target,
      value: './fixture.html'
    },
    Date.now() + 5000
  )
}
it('activates the existing same-workspace document through the actual route', async () => {
  installFolder()
  const state = useAppStore.getState()
  const original = Object.values(state.browserPagesByWorkspace)
    .flat()
    .find((page) => page.id === target.page)
  if (!original) {
    throw new Error('missing page')
  }
  const document = state.createBrowserPage(original.workspaceId, '', {
    docLocation: {
      kind: 'workspace-doc',
      worktreeId: target.worktreeId,
      filePath: join(tmpdir(), 'client-document-folder', 'fixture.html')
    }
  })
  if (!document) {
    throw new Error('missing document page')
  }
  state.setActiveBrowserPage(original.workspaceId, target.page)
  mount(true, () => target.worktreeId, true)
  let result: unknown
  await act(async () => {
    result = await requestDocument()
  })
  expect(result).toMatchObject({
    clientDocument: {
      conversion: 'activated-existing',
      documentPageId: document.id,
      documentWorkspaceId: original.workspaceId
    }
  })
  expect(guest.loadURL).not.toHaveBeenCalled()
})
it('does not let an inactive owner seize an active owner', async () => {
  installFolder()
  mount(false, () => target.worktreeId, true)
  mount(true, () => target.worktreeId, true)
  let result: unknown
  await act(async () => {
    result = await requestDocument()
  })
  expect(result).toMatchObject({ clientDocument: { accepted: true } })
})
it('refuses two active owners without converting the page', async () => {
  installFolder()
  mount()
  mount()
  const convert = vi.spyOn(useAppStore.getState(), 'convertBrowserPage')
  try {
    await expect(requestDocument()).rejects.toThrow('ambiguous')
    expect(convert).not.toHaveBeenCalled()
  } finally {
    convert.mockRestore()
  }
})
it.each(['workspace', 'handle', 'props'] as const)(
  'refuses captured %s ownership replacement before conversion',
  async (kind) => {
    installFolder()
    let worktree = target.worktreeId
    mount(true, () => worktree, true)
    const convert = vi.spyOn(useAppStore.getState(), 'convertBrowserPage')
    const dispatch = window.dispatchEvent.bind(window)
    const spy = vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
      const result = dispatch(event)
      if (event.type === 'orca:browser-client-document-command') {
        if (kind === 'workspace') {
          useAppStore.setState({ activeWorktreeId: 'folder:other' })
          useAppStore.setState({ activeWorktreeId: target.worktreeId })
        } else if (kind === 'handle') {
          const handles = useAppStore.getState().remoteBrowserPageHandlesByPageId
          useAppStore.setState({
            remoteBrowserPageHandlesByPageId: {
              [target.page]: {
                ...handles[target.page],
                placement: { ...placement, pageHostGeneration: 9 }
              }
            }
          })
          useAppStore.setState({ remoteBrowserPageHandlesByPageId: handles })
        } else {
          flushSync(() => {
            worktree = 'folder:other'
            useAppStore.setState((state) => ({
              browserPagesByWorkspace: Object.fromEntries(
                Object.entries(state.browserPagesByWorkspace).map(([id, pages]) => [
                  id,
                  pages.map((page) => ({ ...page, title: 'changed' }))
                ])
              )
            }))
          })
        }
      }
      return result
    })
    try {
      await act(async () => {
        await expect(requestDocument()).rejects.toThrow('owner_changed')
      })
      expect(convert).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
      convert.mockRestore()
    }
  }
)
it('distinguishes foreign workspace ABA during conversion from the intended document page replacement', async () => {
  installFolder()
  mount(true, () => target.worktreeId, true)
  let injected = false
  const unsubscribe = useAppStore.subscribe((state) => {
    if (
      !injected &&
      !Object.values(state.browserPagesByWorkspace)
        .flat()
        .some((page) => page.id === target.page)
    ) {
      injected = true
      useAppStore.setState({ activeWorktreeId: 'folder:other' })
      useAppStore.setState({ activeWorktreeId: target.worktreeId })
    }
  })
  try {
    await act(async () => {
      await expect(requestDocument()).rejects.toThrow('effect_unknown')
    })
    expect(injected).toBe(true)
  } finally {
    unsubscribe()
  }
})
it('reports the existing conversion failure without claiming document success', async () => {
  installFolder()
  mount()
  const convert = vi.spyOn(useAppStore.getState(), 'convertBrowserPage').mockReturnValue(null)
  try {
    await act(async () => {
      await expect(requestDocument()).rejects.toThrow('effect_unknown')
    })
    expect(convert).toHaveBeenCalledOnce()
  } finally {
    convert.mockRestore()
  }
})

it('rejects a late successful conversion when the deadline passes before its observer runs', async () => {
  installFolder()
  mount(true, () => target.worktreeId, true)
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  const unsubscribe = useAppStore.subscribe((state) => {
    if (
      !Object.values(state.browserPagesByWorkspace)
        .flat()
        .some((page) => page.id === target.page)
    ) {
      clock.mockReturnValue(now + 6000)
    }
  })
  try {
    await act(async () => {
      await expect(requestDocument()).rejects.toThrow('effect_unknown')
    })
  } finally {
    unsubscribe()
    clock.mockRestore()
  }
})
it('rejects a stale props owner introduced during the original conversion callback', async () => {
  installFolder()
  let worktree = target.worktreeId
  mount(true, () => worktree, true)
  const original = useAppStore.getState().convertBrowserPage
  const convert = vi
    .spyOn(useAppStore.getState(), 'convertBrowserPage')
    .mockImplementation((...args) => {
      flushSync(() => {
        worktree = 'folder:other'
        useAppStore.setState((state) => ({
          browserPagesByWorkspace: Object.fromEntries(
            Object.entries(state.browserPagesByWorkspace).map(([id, pages]) => [
              id,
              pages.map((page) => ({ ...page, title: 'changed' }))
            ])
          )
        }))
      })
      return original(...args)
    })
  try {
    await act(async () => {
      await expect(requestDocument()).rejects.toThrow('effect_unknown')
    })
  } finally {
    convert.mockRestore()
  }
})
it('refuses non-document input before the original conversion or guest callback', async () => {
  installFolder()
  mount()
  const convert = vi.spyOn(useAppStore.getState(), 'convertBrowserPage')
  try {
    await expect(
      applyBrowserClientDocumentRequest(
        {
          viewer: 'host',
          operation: 'client-document',
          entry: 'address-bar',
          target,
          value: 'https://example.test/'
        },
        Date.now() + 5000
      )
    ).rejects.toThrow('input_unsupported')
    expect(convert).not.toHaveBeenCalled()
    expect(guest.loadURL).not.toHaveBeenCalled()
  } finally {
    convert.mockRestore()
  }
})
