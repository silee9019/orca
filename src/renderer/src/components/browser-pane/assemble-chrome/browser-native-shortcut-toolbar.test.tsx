// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { requestBrowserToolbar } from '@/runtime/browser-toolbar-request'
import { returnAcrossBrowserPageConversion } from '@/lib/browser-page-conversion-history'
import { seedBrowserOverlayFocusOwner } from './browser-overlay-focus.test-fixture'
import { NativeToolbarFixture } from './browser-toolbar-external.test-fixture'
vi.mock('./browser-chrome-toolbar', () => ({ BrowserChromeToolbar: () => null }))
vi.mock('./BrowserImportHintButton', () => ({ browserImportHintControl: () => () => null }))
const initial = useAppStore.getInitialState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
let target: ReturnType<typeof seedBrowserOverlayFocusOwner>
const location = {
  kind: 'workspace-doc' as const,
  worktreeId: 'folder:fixture',
  filePath: '/fixture/report.html'
}
function currentPage() {
  const page = useAppStore.getState().browserPagesByWorkspace[target.workspaceId]?.[0]
  if (!page) {
    throw new Error('missing fixture page')
  }
  return page
}
function prepare(direction: 'back' | 'forward') {
  const state = useAppStore.getState()
  const documentPage = state.convertBrowserPage('page', {
    kind: 'workspace-doc',
    docLocation: location
  })
  if (!documentPage) {
    throw new Error('missing document conversion')
  }
  if (direction === 'back') {
    state.convertBrowserPage(documentPage.id, {
      kind: 'web',
      url: 'https://second.test/',
      browserRuntimeEnvironmentId: null
    })
  } else if (documentPage.convertedFrom) {
    returnAcrossBrowserPageConversion(documentPage.id, documentPage.convertedFrom)
  }
  return currentPage()
}
function mount(fake: {
  getURL: () => string
  getTitle: () => string
  isLoading: () => boolean
  canGoBack: () => boolean
  canGoForward: () => boolean
  goBack: () => void
  goForward: () => void
}) {
  const page = currentPage()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This fake implements the owner metadata/history methods; no native guest is started.
  const guest = fake as Electron.WebviewTag
  render(
    <NativeToolbarFixture
      target={target}
      page={page.id}
      history={{
        webviewRef: { current: guest },
        convertedFrom: page.convertedFrom,
        convertedTo: page.convertedTo
      }}
    />
  )
}
beforeEach(() => {
  target = seedBrowserOverlayFocusOwner()
  useAppStore.setState({ activeModal: 'none', activeView: 'terminal' })
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
it.each(['back', 'forward'] as const)(
  'actual toolbar shortcut %s refuses exhausted history with conversion marker',
  (direction) => {
    const before = prepare(direction)
    const fake = {
      getURL: () => before.url,
      getTitle: () => 'Fixture',
      isLoading: () => true,
      canGoBack: () => false,
      canGoForward: () => false,
      goBack: vi.fn(),
      goForward: vi.fn()
    }
    mount(fake)
    expect(() =>
      requestBrowserToolbar(
        before.id,
        direction === 'back' ? 'back-shortcut' : 'forward-shortcut',
        Date.now() + 2000
      )
    ).toThrow('browser_history_unavailable')
    expect(currentPage()).toEqual(before)
    expect(fake.goBack).not.toHaveBeenCalled()
    expect(fake.goForward).not.toHaveBeenCalled()
  }
)
it('actual toolbar shortcut uses loading guest history without crossing conversion', () => {
  const before = prepare('back')
  let index = 1
  const urls = ['https://first.test/', 'https://second.test/']
  const fake = {
    getURL: () => urls[index],
    getTitle: () => 'Fixture',
    isLoading: () => true,
    canGoBack: () => index > 0,
    canGoForward: () => index < 1,
    goBack: vi.fn(() => {
      index--
    }),
    goForward: vi.fn(() => {
      index++
    })
  }
  mount(fake)
  requestBrowserToolbar(before.id, 'back-shortcut', Date.now() + 2000)
  expect(fake.getURL()).toBe(urls[0])
  requestBrowserToolbar(before.id, 'forward-shortcut', Date.now() + 2000)
  expect(fake.getURL()).toBe(urls[1])
  expect(currentPage()).toEqual(before)
})
