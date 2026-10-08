// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BrowserPage } from '../../../../../shared/browser-workspace-types'
const fixture = vi.hoisted(() => {
  const browserPagesByWorkspace: Record<string, BrowserPage[]> = {}
  const settings: { activeRuntimeEnvironmentId: string | null } = {
    activeRuntimeEnvironmentId: null
  }
  let scroll:
    | ((event: { browserPageId: string; deltaX: number; deltaY: number }) => void)
    | undefined
  return {
    get scroll() {
      return scroll
    },
    subscribe: (listener: typeof scroll) => {
      scroll = listener
      return () => {
        scroll = undefined
      }
    },
    state: {
      settings,
      persistedUIReady: true,
      remoteBrowserPageHandlesByPageId: {},
      browserPagesByWorkspace,
      browserCertificateFailuresByPageId: {},
      recordFeatureInteraction: vi.fn(),
      addBrowserPageAnnotation: vi.fn()
    }
  }
})
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof fixture.state) => unknown) => selector(fixture.state),
    { getState: () => fixture.state }
  )
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionIdFromState: () => null }))
vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutLabel: () => 'Copy' }))
vi.mock('../host-guest/use-browser-page-webview-lifecycle', () => ({
  useBrowserPageWebviewLifecycle: () => {}
}))
vi.mock('../navigate/use-browser-page-webview-url-sync', () => ({
  useBrowserPageWebviewUrlSync: () => {}
}))
vi.mock('../host-guest/use-browser-page-keyboard-shortcuts', () => ({
  useBrowserPageKeyboardShortcuts: () => {}
}))
vi.mock('./use-browser-page-find-shortcuts', () => ({ useBrowserPageFindShortcuts: () => {} }))
vi.mock('./use-browser-page-guest-hit-testing', () => ({ useBrowserPageGuestHitTesting: () => {} }))
vi.mock('../host-guest/use-browser-page-viewport-scroll-reporting', () => ({
  useBrowserPageViewportScrollReporting: () => {}
}))
vi.mock('../host-guest/use-browser-page-webview-partition', () => ({
  useBrowserPageWebviewPartition: () => 'persist:fixture'
}))
vi.mock('../host-guest/use-browser-page-zoom-feedback', () => ({
  useBrowserPageZoomFeedback: () => ({
    paneZoomLevelRef: { current: 0 },
    browserZoomPercent: 100,
    browserDefaultZoomPercent: 100
  })
}))
vi.mock('../navigate/use-browser-page-resource-notices', () => ({
  useBrowserPageResourceNotices: () => ({ resourceNotice: null, setResourceNotice: () => {} })
}))
vi.mock('./browser-page-guest-focus', () => ({ useWebviewGuestFocus: () => ({}) }))
vi.mock('./use-browser-page-chrome-focus', () => ({
  useBrowserPageChromeFocus: () => ({ keepAddressBarFocusRef: { current: false } })
}))
vi.mock('../annotate/use-browser-page-annotation-send', () => ({
  useBrowserPageAnnotationSend: () => ({ browserAnnotations: [] })
}))
vi.mock('../annotate/use-browser-page-markup-capture', () => ({
  useBrowserPageMarkupCapture: () => ({ isActive: false })
}))
vi.mock('../navigate/use-browser-page-navigation-downloads', () => ({
  useBrowserPageNavigationDownloads: () => ({})
}))
vi.mock('../navigate/use-browser-page-reload-actions', () => ({
  useBrowserPageReloadActions: () => ({})
}))
vi.mock('./browser-page-chrome-header', () => ({ BrowserPageChromeHeader: () => null }))
vi.mock('./browser-page-context-menu', () => ({ BrowserPageContextMenu: () => null }))
vi.mock('./browser-page-viewport-overlays', () => ({ BrowserPageViewportOverlays: () => null }))
import { BrowserPagePane } from './browser-page-pane'
import {
  ensureBrowserPageViewport,
  registerBrowserOverlaySlotViewport,
  removeBrowserPageViewport
} from '../host-guest/browser-page-viewport'
import { requestBrowserGrab, type BrowserGrabState } from '@/runtime/browser-grab-request'
const page: BrowserPage = {
  id: 'page',
  workspaceId: 'tab',
  worktreeId: 'folder',
  url: 'https://fixture.invalid',
  title: 'Fixture',
  loading: false,
  faviconUrl: null,
  canGoBack: false,
  canGoForward: false,
  loadError: null,
  createdAt: 1,
  viewportPresetId: 'desktop'
}
const native = {
  setGrabMode: vi.fn().mockResolvedValue({ ok: true }),
  cancelGrab: vi.fn().mockResolvedValue(true),
  awaitGrabSelection: vi.fn(() => new Promise(() => {}))
}
const originalApi = window.api
beforeEach(() => {
  fixture.state.settings.activeRuntimeEnvironmentId = null
  fixture.state.browserPagesByWorkspace = { tab: [page] }
  Object.assign(window, {
    api: { ui: { onScrollBrowserPage: fixture.subscribe }, browser: native }
  })
})
afterEach(() => {
  cleanup()
  removeBrowserPageViewport('page')
  registerBrowserOverlaySlotViewport('tab', null)
  Object.assign(window, { api: originalApi })
  document.body.replaceChildren()
})
function mount(active = true, blank = false) {
  const root = document.createElement('div')
  document.body.append(root)
  registerBrowserOverlaySlotViewport('tab', root)
  const viewport = ensureBrowserPageViewport('page', 'tab')
  if (!viewport) {
    throw new Error('missing viewport')
  }
  Object.defineProperties(viewport.scroller, {
    scrollWidth: { value: 900 },
    clientWidth: { value: 300 },
    scrollHeight: { value: 800 },
    clientHeight: { value: 200 }
  })
  return render(
    <BrowserPagePane
      browserTab={{ ...page, url: blank ? 'about:blank' : page.url }}
      workspaceId="tab"
      worktreeId="folder"
      sessionProfileId={null}
      sessionPartition={null}
      isActive={active}
      chromeShortcutScope="focused"
      isAutomationVisible={false}
      isMobileDriven={false}
      isRemotelyViewed={false}
      inputLocked={false}
      onUpdatePageState={() => {}}
      onSetUrl={() => {}}
    />
  )
}
async function toggle() {
  let pending: Promise<BrowserGrabState> | undefined
  await act(async () => {
    pending = requestBrowserGrab('page', 'toggle', Date.now() + 1000, 'copy')
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing request')
  }
  return pending
}
it('rejects the native blank-page toolbar condition before the existing picker owner starts', async () => {
  native.setGrabMode.mockClear()
  mount(true, true)
  await expect(toggle()).rejects.toThrow('control_disabled')
  expect(native.setGrabMode).not.toHaveBeenCalled()
})
it('retains active nonblank native picker start and inactive rejection', async () => {
  const view = mount()
  expect(await toggle()).toMatchObject({ state: 'awaiting', intent: 'copy' })
  view.unmount()
  mount(false)
  await expect(toggle()).rejects.toThrow('inactive')
})
