// @vitest-environment happy-dom
import { mount, target, guest } from './browser-client-command.test-fixture'
import { act } from '@testing-library/react'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { stageWebRuntimeBrowserTab } from '@/runtime/web-runtime-browser-tab-staging'
import { applyBrowserClientStagedDocumentRequest } from '@/runtime/browser-client-staged-document-request'
import { readBrowserPageDeferredNavigation } from './browser-page-deferred-navigation'
const stagedTarget = {
  worktreeId: target.worktreeId,
  page: target.page,
  environmentId: target.environmentId,
  remotePageId: target.page
}
const command = {
  viewer: 'host' as const,
  operation: 'client-staged-document' as const,
  entry: 'address-bar-staged' as const,
  target: stagedTarget,
  value: './fixture.html'
}
beforeEach(() => {
  Object.assign(window.api.browser, {
    notifyActiveTabChanged: vi.fn().mockResolvedValue(undefined)
  })
  useAppStore.setState({
    browserPagesByWorkspace: {},
    browserTabsByWorktree: {},
    activeBrowserTabIdByWorktree: {},
    remoteBrowserPageHandlesByPageId: {},
    folderWorkspaces: ['fixture', 'other'].map((id) => ({
      id,
      projectGroupId: 'fixture',
      name: id,
      folderPath: join(tmpdir(), 'client-staged-document', id),
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
  expect(
    stageWebRuntimeBrowserTab({
      environmentId: target.environmentId,
      worktreeId: target.worktreeId,
      remotePageId: target.page,
      activate: true,
      clientHosted: true
    })
  ).toMatchObject({ pageId: target.page })
})
function mountStage(active: boolean | ((worktree: string | null) => boolean) = true) {
  return mount(
    active,
    () => target.worktreeId,
    true,
    (handle) => (handle?.placement?.kind === 'client' ? handle.placement : null)
  )
}
it('uses the original staged ClientPane document conversion before the guest-null deferred queue', async () => {
  mountStage()
  let result: unknown
  await act(async () => {
    result = await applyBrowserClientStagedDocumentRequest(command, Date.now() + 5000)
  })
  expect(result).toMatchObject({
    clientStagedDocument: {
      ...stagedTarget,
      accepted: true,
      conversion: 'converted',
      documentWorktreeId: target.worktreeId,
      filePath: join(tmpdir(), 'client-staged-document', 'fixture', 'fixture.html'),
      hostPlacementKnown: false
    }
  })
  expect(readBrowserPageDeferredNavigation(target.page)).toBeNull()
  expect(guest.loadURL).not.toHaveBeenCalled()
  expect(useAppStore.getState().remoteBrowserPageHandlesByPageId[target.page]).toBeUndefined()
})

function submit(documentWorktreeId?: string, value = command.value) {
  return applyBrowserClientStagedDocumentRequest(
    { ...command, value, ...(documentWorktreeId ? { documentWorktreeId } : {}) },
    Date.now() + 5000
  )
}
it('observes the original cross-worktree staged document route and intended source Pane deactivation', async () => {
  mountStage((id) => id === target.worktreeId)
  let result: unknown
  await act(async () => {
    result = await submit(
      'folder:other',
      join(tmpdir(), 'client-staged-document', 'other', 'fixture.html')
    )
  })
  expect(result).toMatchObject({
    clientStagedDocument: {
      conversion: 'opened-in-owning-worktree',
      documentWorktreeId: 'folder:other',
      hostPlacementKnown: false
    }
  })
  expect(useAppStore.getState().activeWorktreeId).toBe('folder:other')
})
it('selects one active staged owner and rejects duplicate offers before conversion', async () => {
  mountStage(false)
  mountStage()
  mountStage()
  const convert = vi.spyOn(useAppStore.getState(), 'convertBrowserPage')
  try {
    await expect(submit()).rejects.toThrow('ambiguous')
    expect(convert).not.toHaveBeenCalled()
  } finally {
    convert.mockRestore()
  }
})
it.each(['workspace', 'handle'] as const)(
  'refuses staged source %s ABA between offer and conversion',
  async (kind) => {
    mountStage()
    const listener = () => {
      if (kind === 'workspace') {
        useAppStore.setState({ activeWorktreeId: 'folder:other' })
        useAppStore.setState({ activeWorktreeId: target.worktreeId })
      } else {
        const handles = useAppStore.getState().remoteBrowserPageHandlesByPageId
        useAppStore.setState({
          remoteBrowserPageHandlesByPageId: { [target.page]: { ...handles[target.page] } }
        })
        useAppStore.setState({ remoteBrowserPageHandlesByPageId: handles })
      }
    }
    window.addEventListener('orca:browser-client-document-command', listener)
    try {
      await act(async () => {
        await expect(submit()).rejects.toThrow('owner_changed')
      })
    } finally {
      window.removeEventListener('orca:browser-client-document-command', listener)
    }
  }
)
it('refuses a late staged conversion observer even before the timer task runs', async () => {
  mountStage()
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
      await expect(submit()).rejects.toThrow('effect_unknown')
    })
  } finally {
    unsubscribe()
    clock.mockRestore()
  }
})
it('refuses cross-worktree input without its explicit owning-worktree selector', async () => {
  mountStage()
  await expect(
    submit(undefined, join(tmpdir(), 'client-staged-document', 'other', 'fixture.html'))
  ).rejects.toThrow('input_unsupported')
  expect(useAppStore.getState().activeWorktreeId).toBe(target.worktreeId)
})
it('keeps HTTP navigation outside the staged document operation', async () => {
  mountStage()
  await expect(submit(undefined, 'https://example.test/')).rejects.toThrow('input_unsupported')
  expect(readBrowserPageDeferredNavigation(target.page)).toBeNull()
  expect(guest.loadURL).not.toHaveBeenCalled()
})
it('refuses the staged operation after placement materializes', async () => {
  useAppStore.setState({
    remoteBrowserPageHandlesByPageId: {
      [target.page]: {
        environmentId: target.environmentId,
        remotePageId: target.page,
        placement: {
          kind: 'client',
          browserHostClientId: 'desktop',
          browserHostGeneration: 1,
          pageHostGeneration: 2
        }
      }
    }
  })
  await expect(submit()).rejects.toThrow('target_unavailable')
})

it('allows one active staged owner while ignoring an inactive retained owner', async () => {
  mountStage(false)
  mountStage()
  let result: unknown
  await act(async () => {
    result = await submit()
  })
  expect(result).toMatchObject({
    clientStagedDocument: { accepted: true, hostPlacementKnown: false }
  })
})
it('activates an existing document through the staged original address route', async () => {
  const original = Object.values(useAppStore.getState().browserPagesByWorkspace)
    .flat()
    .find((page) => page.id === target.page)
  if (!original) {
    throw new Error('fixture stage missing')
  }
  const existing = useAppStore.getState().createBrowserPage(original.workspaceId, '', {
    docLocation: {
      kind: 'workspace-doc',
      worktreeId: target.worktreeId,
      filePath: join(tmpdir(), 'client-staged-document', 'fixture', 'fixture.html')
    }
  })
  if (!existing) {
    throw new Error('fixture document missing')
  }
  useAppStore.getState().setActiveBrowserPage(original.workspaceId, target.page)
  mountStage()
  let result: unknown
  await act(async () => {
    result = await submit()
  })
  expect(result).toMatchObject({
    clientStagedDocument: {
      conversion: 'activated-existing',
      documentPageId: existing.id,
      documentWorkspaceId: original.workspaceId
    }
  })
})
it('rejects foreign workspace ABA during the intended staged source page replacement', async () => {
  mountStage()
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
      await expect(submit()).rejects.toThrow('effect_unknown')
    })
  } finally {
    unsubscribe()
  }
  expect(injected).toBe(true)
})
