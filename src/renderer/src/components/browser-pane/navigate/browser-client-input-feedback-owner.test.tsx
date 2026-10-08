// @vitest-environment happy-dom
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { mount, target, guest } from './browser-client-command.test-fixture'
import { useAppStore } from '@/store'
import { stageWebRuntimeBrowserTab } from '@/runtime/web-runtime-browser-tab-staging'
import { consumeBrowserPageDeferredNavigation } from './browser-page-deferred-navigation'
import { requestBrowserClientInputFeedback } from '@/runtime/browser-client-input-feedback-request'
const request = (value: string, expiresAt = Date.now() + 2000, selected = target) =>
  requestBrowserClientInputFeedback(
    {
      viewer: 'host',
      operation: 'client-input-feedback',
      source: { kind: 'materialized', target: selected },
      value
    },
    expiresAt
  )
const page = () =>
  Object.values(useAppStore.getState().browserPagesByWorkspace)
    .flat()
    .find((page) => page.id === target.page)
it.each(['javascript:fixture-invalid', 'file:///fixture-refused.html'])(
  'uses actual client submit callback for Store and visible rejection feedback %s',
  async (value) => {
    mount()
    await act(async () => {
      await expect(request(value)).resolves.toMatchObject({
        inputRejected: true,
        loadErrorCode: 0,
        navigationStarted: false
      })
    })
    expect(page()?.loadError?.code).toBe(0)
    expect(screen.getByText(page()?.loadError?.description ?? 'missing error')).toBeTruthy()
    expect(guest.loadURL).not.toHaveBeenCalled()
  }
)
it.each(['https://valid.test/', 'orca cli query'])(
  'refuses a valid navigation input before changing error state %s',
  async (value) => {
    mount()
    await expect(request(value)).rejects.toThrow('rejection_required')
    expect(page()?.loadError).toBeFalsy()
    expect(guest.loadURL).not.toHaveBeenCalled()
  }
)

it('refuses stale generation, inactive owner and expired delivery before error writes', async () => {
  mount(false)
  await expect(request('javascript:fixture')).rejects.toThrow('owner_changed')
  await expect(request('javascript:fixture', Date.now() - 1)).rejects.toThrow('expired')
  expect(page()?.loadError).toBeFalsy()
  expect(guest.loadURL).not.toHaveBeenCalled()
})
it('latches Store ABA between offer and execution without writing the error', async () => {
  mount()
  const cycle = () => {
    useAppStore.setState({ activeWorktreeId: 'other' })
    useAppStore.setState({ activeWorktreeId: target.worktreeId })
  }
  window.addEventListener('orca:browser-client-input-feedback', cycle)
  try {
    await expect(request('javascript:fixture')).rejects.toThrow('owner_changed')
  } finally {
    window.removeEventListener('orca:browser-client-input-feedback', cycle)
  }
  expect(page()?.loadError).toBeFalsy()
})
it('rejects concurrent requests before the first feedback commit', async () => {
  mount()
  await act(async () => {
    const first = request('javascript:first')
    await expect(request('javascript:second')).rejects.toThrow('busy')
    await first
  })
  expect(page()?.loadError?.validatedUrl).toBe('javascript:first')
})
it('rejects owner unmount between offer and execution', async () => {
  const view = mount()
  const unmount = () => view.unmount()
  window.addEventListener('orca:browser-client-input-feedback', unmount)
  try {
    await expect(request('javascript:fixture')).rejects.toThrow('owner_changed')
  } finally {
    window.removeEventListener('orca:browser-client-input-feedback', unmount)
  }
  expect(page()?.loadError).toBeFalsy()
})
it('rejects post-write expiry before a timer dispatches', async () => {
  const original = useAppStore.getState().updateBrowserPageState
  vi.spyOn(Date, 'now').mockReturnValue(1000)
  useAppStore.setState({
    updateBrowserPageState: (id, updates) => {
      original(id, updates)
      vi.mocked(Date.now).mockReturnValue(3000)
    }
  })
  mount()
  try {
    await act(async () => {
      await expect(request('javascript:fixture', 2000)).rejects.toThrow('expired')
    })
  } finally {
    vi.restoreAllMocks()
  }
})

it('refuses workspace document input without conversion or filesystem access', async () => {
  useAppStore.setState({
    folderWorkspaces: [
      {
        id: 'fixture',
        projectGroupId: 'fixture',
        name: 'Fixture',
        folderPath: join(tmpdir(), 'client-input-folder'),
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
  await expect(request('./fixture.html')).rejects.toThrow('document_unsupported')
  expect(page()?.loadError).toBeFalsy()
  expect(page()?.docLocation).toBeUndefined()
  expect(guest.loadURL).not.toHaveBeenCalled()
})
it('rejects a stale page generation before feedback', async () => {
  mount()
  await expect(
    request('javascript:fixture', Date.now() + 2000, { ...target, pageHostGeneration: 5 })
  ).rejects.toThrow('owner_changed')
  expect(page()?.loadError).toBeFalsy()
})
it('latches materialized handle generation ABA between offer and execution', async () => {
  mount()
  const handle = useAppStore.getState().remoteBrowserPageHandlesByPageId[target.page]
  const cycle = () => {
    useAppStore.setState({
      remoteBrowserPageHandlesByPageId: {
        [target.page]: {
          ...handle,
          placement: {
            kind: 'client',
            browserHostClientId: target.browserHostClientId,
            browserHostGeneration: 3,
            pageHostGeneration: 99
          }
        }
      }
    })
    useAppStore.setState({ remoteBrowserPageHandlesByPageId: { [target.page]: handle } })
  }
  window.addEventListener('orca:browser-client-input-feedback', cycle)
  try {
    await expect(request('javascript:fixture')).rejects.toThrow('owner_changed')
  } finally {
    window.removeEventListener('orca:browser-client-input-feedback', cycle)
  }
  expect(page()?.loadError).toBeFalsy()
})

it('propagates a synchronous Store writer failure without a success receipt', async () => {
  const original = useAppStore.getState().updateBrowserPageState
  useAppStore.setState({
    updateBrowserPageState: (id, updates) => {
      if (updates.loadError) {
        throw new Error('fixture writer failed')
      }
      original(id, updates)
    }
  })
  mount()
  await expect(request('javascript:fixture')).rejects.toThrow('fixture writer failed')
  expect(page()?.loadError).toBeFalsy()
  expect(guest.loadURL).not.toHaveBeenCalled()
})
it('rejects absent and ambiguous mounted owners before a writer runs', async () => {
  await expect(request('javascript:fixture')).rejects.toThrow('unavailable')
  mount()
  mount()
  await expect(request('javascript:fixture')).rejects.toThrow('ambiguous')
  expect(page()?.loadError).toBeFalsy()
  expect(guest.loadURL).not.toHaveBeenCalled()
})

function mountStage() {
  useAppStore.setState({
    browserPagesByWorkspace: {},
    browserTabsByWorktree: {},
    activeBrowserTabIdByWorktree: {},
    remoteBrowserPageHandlesByPageId: {}
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
  return mount(
    true,
    () => target.worktreeId,
    true,
    (handle) => (handle?.placement?.kind === 'client' ? handle.placement : null)
  )
}
function stagedRequest(value: string) {
  return requestBrowserClientInputFeedback(
    {
      viewer: 'host',
      operation: 'client-input-feedback',
      source: {
        kind: 'staged',
        target: {
          worktreeId: target.worktreeId,
          page: target.page,
          environmentId: target.environmentId,
          remotePageId: target.page
        }
      },
      value
    },
    Date.now() + 2000
  )
}
it.each(['javascript:stage-invalid', 'file:///stage-refused.html'])(
  'applies staged original invalid/file Store and DOM feedback without a guest %s',
  async (value) => {
    mountStage()
    await act(async () => {
      await expect(stagedRequest(value)).resolves.toMatchObject({
        source: { kind: 'staged' },
        inputRejected: true,
        navigationStarted: false
      })
    })
    expect(page()?.loadError?.code).toBe(0)
    expect(screen.getByText(page()?.loadError?.description ?? 'missing error')).toBeTruthy()
    expect(consumeBrowserPageDeferredNavigation(target.page)).toBeNull()
    expect(guest.loadURL).not.toHaveBeenCalled()
  }
)
it('rejects a staged handle object replacement ABA before feedback', async () => {
  mountStage()
  const handle = useAppStore.getState().remoteBrowserPageHandlesByPageId[target.page]
  const cycle = () => {
    useAppStore.setState({ remoteBrowserPageHandlesByPageId: { [target.page]: { ...handle } } })
    useAppStore.setState({ remoteBrowserPageHandlesByPageId: { [target.page]: handle } })
  }
  window.addEventListener('orca:browser-client-input-feedback', cycle)
  try {
    await expect(stagedRequest('javascript:stage-invalid')).rejects.toThrow('owner_changed')
  } finally {
    window.removeEventListener('orca:browser-client-input-feedback', cycle)
  }
  expect(page()?.loadError).toBeFalsy()
  expect(guest.loadURL).not.toHaveBeenCalled()
})
it('refuses restored or unowned staged identity before feedback', async () => {
  mountStage()
  const handle = useAppStore.getState().remoteBrowserPageHandlesByPageId[target.page]
  useAppStore.setState({
    remoteBrowserPageHandlesByPageId: { [target.page]: { ...handle, restoredClientHosted: true } }
  })
  await expect(stagedRequest('javascript:stage-invalid')).rejects.toThrow('owner_changed')
  useAppStore.setState({ remoteBrowserPageHandlesByPageId: {} })
  await expect(stagedRequest('javascript:stage-invalid')).rejects.toThrow('owner_changed')
  expect(page()?.loadError).toBeFalsy()
  expect(guest.loadURL).not.toHaveBeenCalled()
})
