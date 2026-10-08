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
