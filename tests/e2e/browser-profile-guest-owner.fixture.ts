import { browserToolbarImportOwnerFixture } from './browser-toolbar-import-owner.fixture'
import { useAppStore } from '../../src/renderer/src/store'
import { browserSessionRegistry } from '../../src/main/browser/browser-session-registry'
import { BrowserPageToolbar } from '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-page-toolbar'
import {
  registerPersistentWebview,
  webviewRegistry,
  destroyPersistentWebview
} from '../../src/renderer/src/components/browser-pane/host-guest/webview-registry'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { vi } from 'vitest'

export async function browserProfileGuestOwnerFixture() {
  const owner = await browserToolbarImportOwnerFixture()
  await owner.render(0)
  const other = await browserSessionRegistry.createProfile('isolated', 'Other')
  const unregisterGuest = vi.fn(async () => {})
  const createProfile = vi.fn(async ({ scope, label }: { scope: 'isolated'; label: string }) =>
    browserSessionRegistry.createProfile(scope, label)
  )
  Object.assign(window.api.browser, { unregisterGuest, sessionCreateProfile: createProfile })
  await act(async () =>
    useAppStore.setState({ browserSessionProfiles: browserSessionRegistry.listProfiles() })
  )
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const installGuest = (page: string) => {
    const element = document.createElement('div')
    element.dataset.guest = page
    document.body.append(element)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: registry가 사용하는 HTMLElement 이벤트·style·contains·remove만 제공하며 실제 Electron guest를 만들지 않습니다.
    registerPersistentWebview(page, element as Electron.WebviewTag)
    return element
  }
  const Owner = () => {
    const tab = useAppStore((state) => state.browserTabsByWorktree.work?.[0])
    return createElement(BrowserPageToolbar, {
      browserPageId: 'page',
      workspaceId: 'tab',
      worktreeId: 'work',
      sessionProfileId: tab?.sessionProfileId ?? null,
      viewportPresetId: null,
      isActive: true,
      canGoBack: false,
      canGoForward: false,
      loading: false,
      webviewRef: { current: null },
      reloadMenuOpen: false,
      setReloadMenuOpen: () => {},
      reloadButtonLabel: 'Reload',
      reloadButtonLabelKind: 'reload',
      reloadShortcut: '',
      hardReloadShortcut: '',
      runReloadTrigger: () => {},
      addressBarValue: '',
      setAddressBarValue: () => {},
      submitAddressBar: () => {},
      navigateToUrl: () => {},
      addressBarInputRef: { current: null },
      dismissAddressBarSuggestionsRef: { current: null },
      grab: {
        state: 'idle',
        payload: null,
        error: null,
        contextMenu: false,
        toggle: () => {},
        cancel: () => {},
        rearm: () => {},
        exit: () => {}
      },
      grabIntent: 'copy',
      startGrabIntent: () => {},
      isBlankTab: true,
      markupIsActive: false,
      markupStart: async () => {},
      markupCancel: () => {},
      grabElementShortcut: '',
      browserAnnotationsLength: 0,
      shareableArtifactFile: null,
      currentBrowserUrl: 'about:blank',
      externalUrl: null
    })
  }
  await act(async () => root.render(createElement(Owner)))
  return {
    ...owner,
    other,
    unregisterGuest,
    createProfile,
    installGuest,
    webviewRegistry,
    close: async () => {
      await act(async () => root.unmount())
      container.remove()
      await destroyPersistentWebview('page')
      await destroyPersistentWebview('untouched')
      await owner.close()
    }
  }
}
