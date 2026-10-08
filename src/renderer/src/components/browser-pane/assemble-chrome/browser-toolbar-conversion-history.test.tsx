// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings, ORCA_BROWSER_BLANK_URL } from '../../../../../shared/constants'
import { requestBrowserToolbar } from '@/runtime/browser-toolbar-request'
import { returnAcrossBrowserPageConversion } from '@/lib/browser-page-conversion-history'
import { ensureDocPreviewGrant } from '@/lib/doc-preview-grants'
import { useBrowserPageWebviewShortcuts } from '../host-guest/use-browser-page-webview-shortcuts'
import type { BrowserHistoryNavigateCommand } from '../../../../../shared/browser-page-command-target'
import { paneChannel, installClientHostedPaneApi } from '../client-hosted-browser-pane-test-rig'
import { makeFolderWorkspace } from '../../../store/slices/worktrees-slice-test-fixtures'
import type { BrowserNavigationControls } from './browser-navigation-control-row'
import { BrowserPageToolbar } from './browser-page-toolbar'

vi.mock('./browser-chrome-toolbar', () => ({
  BrowserChromeToolbar: ({ controls }: { controls: BrowserNavigationControls }) => (
    <>
      <button onClick={controls.goBack}>Fallback back</button>
      <button onClick={controls.goForward}>Fallback forward</button>
    </>
  )
}))
vi.mock('./BrowserImportHintButton', () => ({
  BrowserImportHintButton: () => null,
  browserImportHintControl: () => () => null
}))

const worktree = 'folder:history-fixture'
const location = {
  kind: 'workspace-doc' as const,
  worktreeId: worktree,
  filePath: '/fixture/report.html'
}
const initial = useAppStore.getInitialState()
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
const revoke = vi.fn(async (_grantId: string) => {})
let workspace = ''
let history = paneChannel<BrowserHistoryNavigateCommand>()
function currentPage() {
  const page = useAppStore.getState().browserPagesByWorkspace[workspace]?.[0]
  if (!page) {
    throw new Error('Missing fixture page')
  }
  return page
}
function Owner() {
  const page = useAppStore((state) => state.browserPagesByWorkspace[workspace]?.[0])
  if (!page || page.docLocation) {
    return null
  }
  return (
    <BrowserPageToolbar
      browserPageId={page.id}
      workspaceId={workspace}
      worktreeId={worktree}
      sessionProfileId={null}
      viewportPresetId={null}
      isActive
      canGoBack={false}
      canGoForward={false}
      convertedFrom={page.convertedFrom}
      convertedTo={page.convertedTo}
      loading={false}
      webviewRef={{ current: null }}
      reloadMenuOpen={false}
      setReloadMenuOpen={() => {}}
      reloadButtonLabel="Reload"
      reloadButtonLabelKind="reload"
      reloadShortcut=""
      hardReloadShortcut=""
      runReloadTrigger={() => {}}
      addressBarValue={page.url}
      setAddressBarValue={() => {}}
      submitAddressBar={() => {}}
      navigateToUrl={() => {}}
      addressBarInputRef={{ current: null }}
      dismissAddressBarSuggestionsRef={{ current: null }}
      grab={{
        state: 'idle',
        payload: null,
        error: null,
        contextMenu: false,
        toggle: () => {},
        cancel: () => {},
        rearm: () => {},
        exit: () => {}
      }}
      grabIntent="copy"
      startGrabIntent={() => {}}
      isBlankTab={false}
      markupIsActive={false}
      markupStart={async () => {}}
      markupCancel={() => {}}
      grabElementShortcut=""
      browserAnnotationsLength={0}
      shareableArtifactFile={null}
      currentBrowserUrl={page.url}
      externalUrl={null}
    />
  )
}
function prepareBack() {
  workspace = useAppStore.getState().createBrowserTab(worktree, '', {
    docLocation: location,
    browserRuntimeEnvironmentId: null
  }).id
  const converted = useAppStore.getState().convertBrowserPage(currentPage().id, {
    kind: 'web',
    url: 'https://fixture.invalid/from-document',
    browserRuntimeEnvironmentId: null
  })
  if (!converted) {
    throw new Error('Fixture doc-to-web conversion failed')
  }
  return converted
}
function prepareForward() {
  workspace = useAppStore
    .getState()
    .createBrowserTab(worktree, 'https://fixture.invalid/original', {
      browserRuntimeEnvironmentId: null
    }).id
  const documentPage = useAppStore.getState().convertBrowserPage(currentPage().id, {
    kind: 'workspace-doc',
    docLocation: location
  })
  if (!documentPage?.convertedFrom) {
    throw new Error('Fixture web-to-doc conversion failed')
  }
  returnAcrossBrowserPageConversion(documentPage.id, documentPage.convertedFrom)
  return currentPage()
}

beforeEach(() => {
  history = paneChannel<BrowserHistoryNavigateCommand>()
  installClientHostedPaneApi({
    browser: { notifyActiveTabChanged: vi.fn(async () => {}) },
    ui: { onBrowserHistoryNavigate: history.subscribe }
  })
  Object.assign(window.api, {
    docPreview: {
      mintGrant: vi.fn(async () => ({
        grantId: 'fixture-grant',
        url: 'orca-preview://fixture/report.html'
      })),
      revokeGrant: revoke
    }
  })
  revoke.mockClear()
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    persistedUIReady: true,
    activeWorktreeId: worktree,
    activeWorkspaceExecutionHostId: 'local',
    folderWorkspaces: [makeFolderWorkspace({ id: 'history-fixture', executionHostId: 'local' })]
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})

describe('actual toolbar conversion history fallback', () => {
  it('renderer and guest shortcut paths do not invent the toolbar conversion fallback', () => {
    const before = prepareBack()
    const agent = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
    })
    function ShortcutOwner() {
      useBrowserPageWebviewShortcuts({
        browserTabId: before.id,
        workspaceId: workspace,
        isActive: true,
        chromeShortcutScope: 'focused',
        isActiveRef: { current: true },
        webviewRef: { current: null },
        paneZoomLevelRef: { current: 0 },
        setBrowserDefaultZoomLevel: () => {},
        showBrowserZoomFeedback: () => {},
        reloadWebviewOrRecoverGuest: () => {}
      })
      return <Owner />
    }
    try {
      render(<ShortcutOwner />)
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: '[',
            code: 'BracketLeft',
            metaKey: true,
            bubbles: true,
            cancelable: true
          })
        )
        history.emit({ browserPageId: before.id, direction: 'back' })
      })
      expect(currentPage().id).toBe(before.id)
      act(() => {
        requestBrowserToolbar(before.id, 'back', Date.now() + 1000)
      })
      expect(currentPage().docLocation).toEqual(location)
    } finally {
      if (agent) {
        Object.defineProperty(navigator, 'userAgent', agent)
      } else {
        Reflect.deleteProperty(navigator, 'userAgent')
      }
    }
  })

  it.each(['back', 'forward'] as const)(
    'typed %s crosses to the stored document without a native guest',
    (direction) => {
      const before = direction === 'back' ? prepareBack() : prepareForward()
      const view = render(<Owner />)
      act(() =>
        expect(requestBrowserToolbar(before.id, direction, Date.now() + 1000)).toEqual({
          action: direction
        })
      )
      const after = currentPage()
      expect(after.id).not.toBe(before.id)
      expect(after.docLocation).toEqual(location)
      expect(after.url).toBe(ORCA_BROWSER_BLANK_URL)
      expect(after.browserRuntimeEnvironmentId).toBeNull()
      expect(direction === 'back' ? after.convertedTo : after.convertedFrom).toMatchObject({
        kind: 'url',
        url: before.url
      })
      expect(
        useAppStore.getState().browserTabsByWorktree[worktree]?.find((tab) => tab.id === workspace)
      ).toMatchObject({
        activePageId: after.id,
        docLocation: location,
        url: ORCA_BROWSER_BLANK_URL
      })
      expect(view.queryByRole('button', { name: 'Fallback back' })).toBeNull()
      expect(() => requestBrowserToolbar(before.id, direction, Date.now() + 1000)).toThrow(
        'browser_toolbar_unavailable'
      )
    }
  )

  it('uses the same actual back callback for the toolbar button', () => {
    const before = prepareBack()
    const view = render(<Owner />)
    fireEvent.click(view.getByRole('button', { name: 'Fallback back' }))
    expect(currentPage()).toMatchObject({
      docLocation: location,
      convertedTo: { kind: 'url', url: before.url }
    })
  })

  it('the existing document return owner replaces its page before the fake grant provider revokes access', async () => {
    workspace = useAppStore
      .getState()
      .createBrowserTab(worktree, 'https://fixture.invalid/original', {
        browserRuntimeEnvironmentId: null
      }).id
    const documentPage = useAppStore.getState().convertBrowserPage(currentPage().id, {
      kind: 'workspace-doc',
      docLocation: location
    })
    if (!documentPage?.convertedFrom) {
      throw new Error('Missing document provenance')
    }
    await ensureDocPreviewGrant(documentPage.id, {
      owner: {
        kind: 'runtime',
        environmentId: 'fixture-runtime',
        worktreeSelector: 'id:fixture',
        worktreeRoot: '/fixture'
      },
      requestBase: '/fixture',
      root: '/fixture',
      entryRelativePath: 'report.html'
    })
    revoke.mockImplementation(async () => {
      expect(currentPage().id).not.toBe(documentPage.id)
      expect(currentPage().docLocation).toBeUndefined()
    })
    returnAcrossBrowserPageConversion(documentPage.id, documentPage.convertedFrom)
    await Promise.resolve()
    expect(revoke).toHaveBeenCalledExactlyOnceWith('fixture-grant')
    expect(currentPage()).toMatchObject({
      url: 'https://fixture.invalid/original',
      browserRuntimeEnvironmentId: null,
      convertedTo: { kind: 'workspace-doc', docLocation: location }
    })
  })
})
