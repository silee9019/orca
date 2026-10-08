// @vitest-environment happy-dom
import { tmpdir } from 'node:os'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, vi, type Mock } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../../shared/constants'
import { TooltipProvider } from '@/components/ui/tooltip'
import { installClientHostedPaneApi } from '../client-hosted-browser-pane-test-rig'
import { ClientHostedBrowserPagePane } from '../ClientHostedBrowserPagePane'
const fixture: { attach: Mock; publish: Mock } = vi.hoisted(() => ({
  attach: vi.fn(),
  publish: vi.fn()
}))
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
export const target = {
  worktreeId: 'folder:fixture',
  page: 'page',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
export const placement = {
  kind: 'client' as const,
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
export let url = 'https://before.test/'
let loading = false
export let finishLoad: () => void = () => {}
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
export let guest: ReturnType<typeof makeGuest>
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
export function mount(active = true, getWorktreeId: () => string = () => target.worktreeId) {
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
          worktreeId={getWorktreeId()}
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

export { fixture }
