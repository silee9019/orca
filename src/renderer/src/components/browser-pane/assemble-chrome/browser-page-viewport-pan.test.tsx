// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
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
      browserCertificateFailuresByPageId: {}
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
vi.mock('../annotate/useGrabMode', () => ({ useGrabMode: () => ({ state: 'idle' }) }))
vi.mock('../annotate/use-browser-page-markup-capture', () => ({
  useBrowserPageMarkupCapture: () => ({ isActive: false })
}))
vi.mock('../annotate/use-browser-page-grab-annotations', () => ({
  useBrowserPageGrabAnnotations: () => ({})
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
  removeBrowserPageViewport,
  getBrowserPageViewportScrollState
} from '../host-guest/browser-page-viewport'
import { applyBrowserViewerRequest } from '@/runtime/browser-viewer-bridge'
import { requestBrowserViewportPan } from '@/runtime/browser-viewport-pan-request'
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
const originalApi = window.api
beforeEach(() => {
  fixture.state.settings.activeRuntimeEnvironmentId = null
  fixture.state.browserPagesByWorkspace = { tab: [page] }
  Object.assign(window, { api: { ui: { onScrollBrowserPage: fixture.subscribe } } })
})
afterEach(() => {
  cleanup()
  removeBrowserPageViewport('page')
  registerBrowserOverlaySlotViewport('tab', null)
  Object.assign(window, { api: originalApi })
  document.body.replaceChildren()
})
function mount(active = true) {
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
      browserTab={page}
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
it('mounts the actual pane and reuses the same viewport as its existing IPC wheel listener', async () => {
  mount()
  fixture.scroll?.({ browserPageId: 'page', deltaX: 10, deltaY: 20 })
  expect(getBrowserPageViewportScrollState('page')).toMatchObject({ scrollLeft: 10, scrollTop: 20 })
  expect(
    await requestBrowserViewportPan('page', { deltaX: 30, deltaY: 40 }, Date.now() + 1000)
  ).toMatchObject({
    before: { scrollLeft: 10, scrollTop: 20 },
    after: { scrollLeft: 40, scrollTop: 60 }
  })
})
it('keeps a retained inactive pane from accepting a typed pan', async () => {
  mount(false)
  await expect(
    requestBrowserViewportPan('page', { deltaX: 30, deltaY: 40 }, Date.now() + 1000)
  ).rejects.toThrow('inactive')
  expect(getBrowserPageViewportScrollState('page')?.scrollTop).toBe(0)
})

it('routes the actual viewer command to the mounted pane and refuses foreign runtime pages', async () => {
  mount()
  const command = {
    viewer: 'host' as const,
    operation: 'viewport-pan' as const,
    page: 'page',
    delta: { deltaX: 30, deltaY: 40 }
  }
  const request = { id: 'fixture', expiresAt: Date.now() + 1000, command }
  expect(await applyBrowserViewerRequest(request)).toMatchObject({
    applied: true,
    rendered: false,
    viewportPan: { page: 'page', after: { scrollLeft: 30, scrollTop: 40 } }
  })
  fixture.state.settings.activeRuntimeEnvironmentId = 'remote'
  await expect(applyBrowserViewerRequest(request)).rejects.toThrow('viewer_runtime_mismatch')
  fixture.state.settings.activeRuntimeEnvironmentId = null
  fixture.state.browserPagesByWorkspace = {
    tab: [{ ...page, browserRuntimeEnvironmentId: 'remote' }]
  }
  await expect(applyBrowserViewerRequest(request)).rejects.toThrow('browser_page_host_mismatch')
  expect(getBrowserPageViewportScrollState('page')?.scrollTop).toBe(40)
})
