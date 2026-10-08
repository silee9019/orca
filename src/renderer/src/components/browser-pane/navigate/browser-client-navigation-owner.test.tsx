import type { BrowserFindAction } from '@/runtime/browser-find-request'
// @vitest-environment happy-dom
import { tmpdir } from 'node:os'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../../shared/constants'
import { applyBrowserViewerRequest } from '@/runtime/browser-viewer-bridge'
import type { BrowserClientNavigationReceipt } from '../../../../../shared/rpc-contract/browser-client-navigation-params'
import { TooltipProvider } from '@/components/ui/tooltip'
import { installClientHostedPaneApi } from '../client-hosted-browser-pane-test-rig'
import { ClientHostedBrowserPagePane } from '../ClientHostedBrowserPagePane'
const fixture = vi.hoisted(() => ({ attach: vi.fn(), publish: vi.fn() }))
vi.mock('../browser-client-page-renderer-installation', () => ({
  attachBrowserClientPageToViewport: fixture.attach
}))
vi.mock('./use-browser-failure-commands', () => ({
  createBrowserFailureOwner: () => undefined,
  openBrowserFailureExternalUrl: vi.fn()
}))
vi.mock('../annotate/use-client-hosted-browser-markup', () => ({
  useClientHostedBrowserMarkup: () => ({ drawButton: null, overlay: null })
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
const initial = useAppStore.getInitialState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
const target = {
  worktreeId: 'folder:fixture',
  page: 'page',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
const placement = {
  kind: 'client' as const,
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
let url = 'https://before.test/'
let loading = false
let finishLoad: () => void = () => {}
let revision = 0
function makeGuest() {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The fixture supplies the Electron methods exercised by the real attach, URL submission and metadata owners; no native guest exists.
  const guest = document.createElement('webview') as Electron.WebviewTag
  Object.assign(guest, {
    getURL: () => url,
    getTitle: () => 'Fixture',
    isLoading: () => loading,
    canGoBack: () => false,
    canGoForward: () => false,
    getWebContentsId: () => 42,
    getZoomLevel: () => 0,
    setZoomLevel: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    findInPage: vi.fn(),
    stopFindInPage: vi.fn(),
    reload: vi.fn(),
    reloadIgnoringCache: vi.fn(),
    stop: vi.fn(),
    loadURL: vi.fn((value: string) => {
      loading = true
      return new Promise<void>((resolve) => {
        finishLoad = () => {
          url = value
          loading = false
          guest.dispatchEvent(Object.assign(new Event('did-navigate'), { url }))
          guest.dispatchEvent(new Event('did-stop-loading'))
          resolve()
        }
      })
    })
  })
  return guest
}
let guest: ReturnType<typeof makeGuest>
beforeEach(() => {
  url = 'https://before.test/'
  loading = false
  revision = 0
  fixture.publish.mockReset().mockResolvedValue({ status: 'published', accepted: true })
  installClientHostedPaneApi({ browser: { publishClientPageMetadata: fixture.publish } })
  guest = makeGuest()
  fixture.attach.mockReturnValue({
    webview: guest,
    detach: vi.fn(),
    nextMetadataRevision: () => ++revision
  })
  useAppStore.setState({
    settings: getDefaultSettings(tmpdir()),
    persistedUIReady: true,
    activeModal: 'none',
    activeWorktreeId: target.worktreeId
  })
  useAppStore.getState().createBrowserTab(target.worktreeId, url, { browserPageId: target.page })
  useAppStore.setState((state) => ({
    browserPagesByWorkspace: Object.fromEntries(
      Object.entries(state.browserPagesByWorkspace).map(([id, pages]) => [
        id,
        pages.map((page) => ({ ...page, browserRuntimeEnvironmentId: target.environmentId }))
      ])
    )
  }))
  useAppStore.setState({
    settings: {
      ...getDefaultSettings(tmpdir()),
      activeRuntimeEnvironmentId: target.environmentId
    },
    remoteBrowserPageHandlesByPageId: {
      [target.page]: {
        environmentId: target.environmentId,
        remotePageId: target.remotePageId,
        placement
      }
    }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  if (api) {
    Object.defineProperty(window, 'api', api)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
function mount(active = true) {
  function Owner() {
    const page = useAppStore((state) =>
      Object.values(state.browserPagesByWorkspace)
        .flat()
        .find((candidate) => candidate.id === target.page)
    )
    if (!page) {
      throw new Error('fixture page missing')
    }
    const state = useAppStore.getState()
    return (
      <TooltipProvider>
        <ClientHostedBrowserPagePane
          browserTab={page}
          workspaceId={page.workspaceId}
          runtimeEnvironmentId={target.environmentId}
          worktreeId={target.worktreeId}
          placement={placement}
          isActive={active}
          chromeShortcutScope="focused"
          onUpdatePageState={state.updateBrowserPageState}
          onSetUrl={state.setBrowserPageUrl}
        />
      </TooltipProvider>
    )
  }
  return render(<Owner />)
}
async function begin() {
  let pending: Promise<BrowserClientNavigationReceipt> | undefined
  await act(async () => {
    pending = applyBrowserViewerRequest({
      id: 'fixture',
      expiresAt: Date.now() + 5000,
      command: {
        viewer: 'host',
        operation: 'client-navigation',
        target,
        url: 'https://after.test/'
      }
    }).then((result) => {
      if (!result.clientNavigation) {
        throw new Error('missing receipt')
      }
      return result.clientNavigation
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing command')
  }
  return { pending }
}
it('waits for actual Pane navigation and the accepted metadata publication before returning', async () => {
  mount()
  const { pending } = await begin()
  const completed = vi.fn()
  void pending.then(completed)
  expect(guest.loadURL).toHaveBeenCalledWith('https://after.test/')
  expect(completed).not.toHaveBeenCalled()
  expect(url).toBe('https://before.test/')
  await act(async () => finishLoad())
  expect(await pending).toMatchObject({
    ...target,
    url: 'https://after.test/',
    loading: false,
    accepted: true
  })
  expect(fixture.publish).toHaveBeenLastCalledWith(
    expect.objectContaining({
      environmentId: target.environmentId,
      params: expect.objectContaining({
        browserPageId: target.page,
        url: 'https://after.test/',
        loading: false,
        pageHostGeneration: 4
      })
    })
  )
  expect(
    Object.values(useAppStore.getState().browserPagesByWorkspace)
      .flat()
      .find((page) => page.id === target.page)?.url
  ).toBe('https://after.test/')
})
it('refuses duplicate actual owners before submitting the guest navigation', async () => {
  mount()
  mount()
  const { pending } = await begin()
  await expect(pending).rejects.toThrow('browser_client_navigation_owner_ambiguous')
  expect(guest.loadURL).not.toHaveBeenCalled()
})
it('refuses accepted guest navigation when metadata publication is refused', async () => {
  mount()
  await act(async () => {})
  fixture.publish.mockResolvedValue({ status: 'refused' })
  const { pending } = await begin()
  await act(async () => finishLoad())
  await expect(pending).rejects.toThrow('browser_client_navigation_metadata_unverified')
})
it('refuses an inactive actual Pane before navigation', async () => {
  mount(false)
  const { pending } = await begin()
  await expect(pending).rejects.toThrow('browser_client_navigation_inactive')
  expect(guest.loadURL).not.toHaveBeenCalled()
})
it('refuses stale materialized placement before navigation', async () => {
  mount()
  await act(async () =>
    useAppStore.setState({
      remoteBrowserPageHandlesByPageId: {
        [target.page]: {
          environmentId: target.environmentId,
          remotePageId: target.remotePageId,
          placement: { ...placement, pageHostGeneration: 5 }
        }
      }
    })
  )
  const { pending } = await begin()
  await expect(pending).rejects.toThrow('browser_client_navigation_target_mismatch')
  expect(guest.loadURL).not.toHaveBeenCalled()
})
it('does not report navigation when a no-op guest resolves without a navigation event', async () => {
  Object.assign(guest, { loadURL: vi.fn(async () => {}) })
  mount()
  const { pending } = await begin()
  await expect(pending).rejects.toThrow('browser_client_navigation_owner_changed_effect_unknown')
})
it('waits for the metadata provider and rejects generation replacement while it is pending', async () => {
  mount()
  let acknowledge: () => void = () => {}
  const held = new Promise<{ status: 'published'; accepted: true }>((resolve) => {
    acknowledge = () => resolve({ status: 'published', accepted: true })
  })
  fixture.publish.mockReturnValue(held)
  const { pending } = await begin()
  const completed = vi.fn()
  void pending.then(completed, () => {})
  await act(async () => finishLoad())
  expect(completed).not.toHaveBeenCalled()
  await act(async () =>
    useAppStore.setState({
      remoteBrowserPageHandlesByPageId: {
        [target.page]: {
          environmentId: target.environmentId,
          remotePageId: target.remotePageId,
          placement: { ...placement, pageHostGeneration: 5 }
        }
      }
    })
  )
  await act(async () => acknowledge())
  await expect(pending).rejects.toThrow('browser_client_navigation_effect_unknown')
  expect(completed).not.toHaveBeenCalled()
})
it('rejects unmount while the actual guest navigation promise is pending', async () => {
  const view = mount()
  const { pending } = await begin()
  view.unmount()
  await expect(pending).rejects.toThrow('browser_client_navigation_owner_changed_effect_unknown')
  await act(async () => finishLoad())
})

it('edits the address through the actual materialized client Pane controller', async () => {
  mount()
  let result
  await act(async () => {
    result = await applyBrowserViewerRequest({
      id: 'client-address',
      expiresAt: Date.now() + 1000,
      command: {
        viewer: 'host',
        operation: 'client-address',
        target,
        command: { action: 'draft', text: 'https://draft.test/' }
      }
    })
  })
  expect(result).toMatchObject({
    applied: true,
    clientAddress: { target, state: { value: 'https://draft.test/', open: true, focused: true } }
  })
  expect(document.querySelector('input')?.value).toBe('https://draft.test/')
  expect(guest.loadURL).not.toHaveBeenCalled()
})
it('refuses duplicate client address owners before editing either field', async () => {
  mount()
  mount()
  await expect(
    applyBrowserViewerRequest({
      id: 'duplicate-address',
      expiresAt: Date.now() + 1000,
      command: {
        viewer: 'host',
        operation: 'client-address',
        target,
        command: { action: 'draft', text: 'changed' }
      }
    })
  ).rejects.toThrow('owner_unavailable_or_ambiguous')
  expect(
    Array.from(document.querySelectorAll('input')).every((input) => input.value !== 'changed')
  ).toBe(true)
})
it('refuses a stale client address placement without submitting the guest', async () => {
  mount()
  const stale = { ...target, pageHostGeneration: target.pageHostGeneration + 1 }
  await expect(
    applyBrowserViewerRequest({
      id: 'stale-address',
      expiresAt: Date.now() + 1000,
      command: {
        viewer: 'host',
        operation: 'client-address',
        target: stale,
        command: { action: 'draft', text: 'changed' }
      }
    })
  ).rejects.toThrow('target_unavailable')
  expect(document.querySelector('input')?.value).not.toBe('changed')
  expect(guest.loadURL).not.toHaveBeenCalled()
})
it.each(['inactive', 'staged', 'restored'] as const)(
  'refuses %s client address owners before editing',
  async (kind) => {
    if (kind !== 'inactive') {
      useAppStore.setState({
        remoteBrowserPageHandlesByPageId: {
          [target.page]: {
            environmentId: target.environmentId,
            remotePageId: target.remotePageId,
            placement,
            ...(kind === 'staged' ? { staged: true } : { restoredFromSession: true })
          }
        }
      })
    }
    mount(kind !== 'inactive')
    await expect(
      applyBrowserViewerRequest({
        id: 'unavailable-address',
        expiresAt: Date.now() + 1000,
        command: {
          viewer: 'host',
          operation: 'client-address',
          target,
          command: { action: 'draft', text: 'changed' }
        }
      })
    ).rejects.toThrow()
    expect(document.querySelector('input')?.value).not.toBe('changed')
    expect(guest.loadURL).not.toHaveBeenCalled()
  }
)
it('refuses the address receipt when client generation changes while its edit is pending', async () => {
  mount()
  let pending
  await act(async () => {
    pending = applyBrowserViewerRequest({
      id: 'pending-address',
      expiresAt: Date.now() + 1000,
      command: {
        viewer: 'host',
        operation: 'client-address',
        target,
        command: { action: 'draft', text: 'changed' }
      }
    })
    void pending.catch(() => {})
    useAppStore.setState({
      remoteBrowserPageHandlesByPageId: {
        [target.page]: {
          environmentId: target.environmentId,
          remotePageId: target.remotePageId,
          placement: { ...placement, pageHostGeneration: 5 }
        }
      }
    })
  })
  await expect(pending).rejects.toThrow('owner_changed_effect_unknown')
})
it('reuses the client chrome focus owner for address focus and selection', async () => {
  mount()
  let result
  await act(async () => {
    result = await applyBrowserViewerRequest({
      id: 'focus-address',
      expiresAt: Date.now() + 1000,
      command: { viewer: 'host', operation: 'client-address', target, command: { action: 'focus' } }
    })
  })
  const input = document.querySelector('input')
  expect(document.activeElement).toBe(input)
  expect(input?.selectionStart).toBe(0)
  expect(input?.selectionEnd).toBe(input?.value.length)
  expect(result).toMatchObject({
    clientAddress: { state: { focused: true, open: true, chromeFocusOwnerInvoked: true } }
  })
})

it.each(['workspace', 'handle'] as const)(
  'rejects client address blur after same-act %s ownership ABA',
  async (kind) => {
    mount()
    await act(async () => {
      await applyBrowserViewerRequest({
        id: 'open-address-aba',
        expiresAt: Date.now() + 2000,
        command: {
          viewer: 'host',
          operation: 'client-address',
          target,
          command: { action: 'open' }
        }
      })
    })
    let pending: ReturnType<typeof applyBrowserViewerRequest> | undefined
    await act(async () => {
      pending = applyBrowserViewerRequest({
        id: 'blur-address-aba',
        expiresAt: Date.now() + 2000,
        command: {
          viewer: 'host',
          operation: 'client-address',
          target,
          command: { action: 'blur' }
        }
      })
      void pending.catch(() => {})
      if (kind === 'workspace') {
        useAppStore.setState({ activeWorktreeId: 'folder:other' })
        useAppStore.setState({ activeWorktreeId: target.worktreeId })
      } else {
        const handles = useAppStore.getState().remoteBrowserPageHandlesByPageId
        useAppStore.setState({
          remoteBrowserPageHandlesByPageId: {
            [target.page]: {
              ...handles[target.page],
              placement: { ...placement, pageHostGeneration: 5 }
            }
          }
        })
        useAppStore.setState({ remoteBrowserPageHandlesByPageId: handles })
      }
    })
    await expect(pending).rejects.toThrow('owner_changed_effect_unknown')
  }
)

it.each(['workspace', 'handle'] as const)(
  'rejects a captured client address offer after same-dispatch %s ABA before editing',
  async (kind) => {
    mount()
    const replaceOwnership = (): void => {
      if (kind === 'workspace') {
        useAppStore.setState({ activeWorktreeId: 'folder:other' })
        useAppStore.setState({ activeWorktreeId: target.worktreeId })
      } else {
        const handles = useAppStore.getState().remoteBrowserPageHandlesByPageId
        useAppStore.setState({
          remoteBrowserPageHandlesByPageId: {
            [target.page]: {
              ...handles[target.page],
              placement: { ...placement, pageHostGeneration: 5 }
            }
          }
        })
        useAppStore.setState({ remoteBrowserPageHandlesByPageId: handles })
      }
    }
    const dispatch = window.dispatchEvent.bind(window)
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
      const result = dispatch(event)
      if (event.type === 'orca:browser-address-command') {
        replaceOwnership()
      }
      return result
    })
    let pending: ReturnType<typeof applyBrowserViewerRequest> | undefined
    try {
      await act(async () => {
        pending = applyBrowserViewerRequest({
          id: 'captured-address-aba',
          expiresAt: Date.now() + 2000,
          command: {
            viewer: 'host',
            operation: 'client-address',
            target,
            command: { action: 'draft', text: 'must-not-edit' }
          }
        })
        void pending.catch(() => {})
      })
      await expect(pending).rejects.toThrow('owner_changed_effect_unknown')
      expect(document.querySelector('input')?.value).not.toBe('must-not-edit')
      expect(guest.loadURL).not.toHaveBeenCalled()
    } finally {
      dispatchSpy.mockRestore()
    }
  }
)

it('disposes the synchronous client address lifetime subscription on actual Pane unmount', () => {
  const subscribe = useAppStore.subscribe
  const disposed = vi.fn()
  const subscription = vi.spyOn(useAppStore, 'subscribe').mockImplementation((listener) => {
    const unsubscribe = subscribe(listener)
    return () => {
      disposed()
      unsubscribe()
    }
  })
  try {
    const owner = mount()
    expect(subscription).toHaveBeenCalled()
    owner.unmount()
    expect(disposed).toHaveBeenCalledTimes(subscription.mock.calls.length)
  } finally {
    subscription.mockRestore()
  }
})

async function clientFind(action: BrowserFindAction, query?: string) {
  let pending: ReturnType<typeof applyBrowserViewerRequest> | undefined
  await act(async () => {
    pending = applyBrowserViewerRequest({
      id: 'client-find',
      expiresAt: Date.now() + 2000,
      command: { viewer: 'host', operation: 'client-find', target, action, query }
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing client find request')
  }
  return pending
}
it('uses the actual client Pane find owner for query, guest traversal, counts and close', async () => {
  mount()
  expect(await clientFind('query', 'needle')).toMatchObject({
    clientFind: { state: { open: true, query: 'needle' } }
  })
  expect(
    document.querySelector<HTMLInputElement>('input[placeholder="Find in page..."]')?.value
  ).toBe('needle')
  await clientFind('next')
  expect(guest.findInPage).toHaveBeenLastCalledWith('needle', { forward: true, findNext: false })
  await clientFind('previous')
  expect(guest.findInPage).toHaveBeenLastCalledWith('needle', { forward: false, findNext: false })
  act(() =>
    guest.dispatchEvent(
      Object.assign(new Event('found-in-page'), {
        result: { activeMatchOrdinal: 2, matches: 3 }
      })
    )
  )
  expect(await clientFind('status')).toMatchObject({
    clientFind: { state: { activeMatch: 2, totalMatches: 3 } }
  })
  expect(await clientFind('close')).toMatchObject({ clientFind: { state: { open: false } } })
  expect(document.querySelector('input[placeholder="Find in page..."]')).toBeNull()
  expect(guest.stopFindInPage).toHaveBeenCalledWith('clearSelection')
  expect(guest.loadURL).not.toHaveBeenCalled()
})

it.each(['duplicate', 'inactive', 'stale', 'staged', 'restored'] as const)(
  'refuses %s client find owners before opening or querying the guest',
  async (kind) => {
    if (kind === 'stale' || kind === 'staged' || kind === 'restored') {
      useAppStore.setState({
        remoteBrowserPageHandlesByPageId: {
          [target.page]: {
            environmentId: target.environmentId,
            remotePageId: target.remotePageId,
            placement: kind === 'stale' ? { ...placement, pageHostGeneration: 5 } : placement,
            ...(kind === 'staged' ? { staged: true } : {}),
            ...(kind === 'restored' ? { restoredFromSession: true } : {})
          }
        }
      })
    }
    mount(kind !== 'inactive')
    if (kind === 'duplicate') {
      mount()
    }
    await expect(clientFind('query', 'forbidden')).rejects.toThrow()
    expect(document.querySelector('input[placeholder="Find in page..."]')).toBeNull()
    expect(guest.findInPage).not.toHaveBeenCalled()
  }
)
it.each(['workspace', 'handle'] as const)(
  'invalidates pending client find after same-act %s ownership ABA',
  async (kind) => {
    mount()
    let pending: ReturnType<typeof applyBrowserViewerRequest> | undefined
    await act(async () => {
      pending = applyBrowserViewerRequest({
        id: 'find-aba',
        expiresAt: Date.now() + 2000,
        command: { viewer: 'host', operation: 'client-find', target, action: 'open' }
      })
      void pending.catch(() => {})
      if (kind === 'workspace') {
        useAppStore.setState({ activeWorktreeId: 'folder:other' })
        useAppStore.setState({ activeWorktreeId: target.worktreeId })
      } else {
        const handles = useAppStore.getState().remoteBrowserPageHandlesByPageId
        useAppStore.setState({
          remoteBrowserPageHandlesByPageId: {
            [target.page]: {
              ...handles[target.page],
              placement: { ...placement, pageHostGeneration: 5 }
            }
          }
        })
        useAppStore.setState({ remoteBrowserPageHandlesByPageId: handles })
      }
    })
    await expect(pending).rejects.toThrow('owner_changed_effect_unknown')
  }
)
it('invalidates a captured client find offer before a restored workspace can open it', async () => {
  mount()
  const dispatch = window.dispatchEvent.bind(window)
  const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
    const result = dispatch(event)
    if (event.type === 'orca:browser-find-command') {
      useAppStore.setState({ activeWorktreeId: 'folder:other' })
      useAppStore.setState({ activeWorktreeId: target.worktreeId })
    }
    return result
  })
  try {
    await expect(clientFind('query', 'forbidden')).rejects.toThrow('owner_changed_effect_unknown')
    expect(document.querySelector('input[placeholder="Find in page..."]')).toBeNull()
    expect(guest.findInPage).not.toHaveBeenCalled()
  } finally {
    dispatchSpy.mockRestore()
  }
})
it('rejects an oversized client find query and unavailable guest traversal', async () => {
  mount()
  await expect(clientFind('query', '한'.repeat(800))).rejects.toThrow()
  expect(guest.findInPage).not.toHaveBeenCalled()
  await clientFind('query', 'needle')
  vi.mocked(guest.findInPage).mockImplementationOnce(() => {
    throw new Error('guest gone')
  })
  await expect(clientFind('next')).rejects.toThrow('browser_find_guest_unavailable')
})

it.each(['open', 'query'] as const)(
  'rejects client find %s commit after a hard deadline without running timeout tasks',
  async (action) => {
    mount()
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    let pending: ReturnType<typeof applyBrowserViewerRequest> | undefined
    try {
      await act(async () => {
        pending = applyBrowserViewerRequest({
          id: 'late-find',
          expiresAt: now + 1000,
          command: { viewer: 'host', operation: 'client-find', target, action, query: 'needle' }
        })
        void pending.catch(() => {})
        clock.mockReturnValue(now + 1001)
      })
      await expect(pending).rejects.toThrow('request_expired')
    } finally {
      clock.mockRestore()
    }
  }
)

it('rejects a client find guest traversal receipt completed after its deadline', async () => {
  mount()
  await clientFind('query', 'needle')
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  vi.mocked(guest.findInPage).mockImplementationOnce(() => {
    clock.mockReturnValue(now + 2001)
    return 1
  })
  try {
    await expect(clientFind('next')).rejects.toThrow('request_expired')
  } finally {
    clock.mockRestore()
  }
})

it.each(['next', 'previous'] as const)(
  'rejects %s guest traversal ownership ABA before success acknowledgement',
  async (action) => {
    mount()
    await clientFind('query', 'needle')
    vi.mocked(guest.findInPage).mockImplementationOnce(() => {
      useAppStore.setState({ activeWorktreeId: 'folder:other' })
      useAppStore.setState({ activeWorktreeId: target.worktreeId })
      return 1
    })
    await expect(clientFind(action)).rejects.toThrow('owner_changed_effect_unknown')
  }
)
it('rejects client find traversal handle ABA before success acknowledgement', async () => {
  mount()
  await clientFind('query', 'needle')
  vi.mocked(guest.findInPage).mockImplementationOnce(() => {
    const handles = useAppStore.getState().remoteBrowserPageHandlesByPageId
    useAppStore.setState({
      remoteBrowserPageHandlesByPageId: {
        [target.page]: {
          ...handles[target.page],
          placement: { ...placement, pageHostGeneration: 5 }
        }
      }
    })
    useAppStore.setState({ remoteBrowserPageHandlesByPageId: handles })
    return 1
  })
  await expect(clientFind('next')).rejects.toThrow('owner_changed_effect_unknown')
})
