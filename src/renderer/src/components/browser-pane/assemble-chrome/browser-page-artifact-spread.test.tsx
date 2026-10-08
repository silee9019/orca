// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BrowserPageToolbar } from './browser-page-toolbar'
import { getDefaultSettings } from '../../../../../shared/constants'
import { BrowserToolbarMenuDropdown } from './browser-toolbar-menu-dropdown'
import type * as PublishFlow from '../../artifacts/artifact-publish-flow'
import type { ArtifactWriteRequest } from '../../../../../shared/artifacts'
import { TooltipProvider } from '../../ui/tooltip'
import { useAppStore } from '../../../store'
import type { BrowserChromeOverflowMenuProps } from './browser-chrome-folded-tools'

vi.mock('./use-browser-chrome-tool-fold', () => ({
  BROWSER_CHROME_FOLD_ORDER: ['share'],
  useBrowserChromeToolFold: () => new Set(['share'])
}))
vi.mock('./browser-navigation-control-row', () => ({
  BrowserNavigationControlRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
}))
vi.mock('../annotate/MarkupDrawButton', () => ({ MarkupDrawButton: () => null }))
vi.mock('./BrowserAddressBar', () => ({ default: () => null }))
vi.mock('./BrowserImportHintButton', () => ({ browserImportHintControl: () => undefined }))
vi.mock('./BrowserToolbarMenu', () => ({ BrowserToolbarMenu: Menu }))
const provider = vi.hoisted(() => {
  const requests: ArtifactWriteRequest[] = []
  return {
    lookup: vi.fn(async (_sourceKey: string) => null),
    publish: vi.fn(async (createRequest: () => Promise<ArtifactWriteRequest>) => {
      requests.push(await createRequest())
      return null
    }),
    requests
  }
})
vi.mock('../../artifacts/artifact-published-link-client', () => ({
  getPublishedArtifactLink: provider.lookup
}))
vi.mock('../../artifacts/artifact-publish-flow', async (importOriginal) => {
  const actual = await importOriginal<typeof PublishFlow>()
  return { ...actual, publishArtifactFromSurface: provider.publish }
})

const closeEvents: boolean[] = []
function Menu({ overflow }: { overflow: BrowserChromeOverflowMenuProps }) {
  const [open, setOpen] = useState(false)
  return (
    <BrowserToolbarMenuDropdown
      menuOpen={open}
      onMenuOpenChange={setOpen}
      allProfiles={[]}
      effectiveProfileId="default"
      onSwitchProfile={() => {}}
      onNewProfile={() => {}}
      detectedBrowsers={[]}
      onFetchDetectedBrowsers={() => {}}
      browserSessionImportState={null}
      onImportFromBrowser={() => {}}
      onImportFromFile={() => {}}
      viewportPresetId={null}
      onApplyViewportPreset={() => {}}
      overflow={{
        ...overflow,
        onMenuCloseAutoFocus: (event) => {
          overflow.onMenuCloseAutoFocus(event)
          closeEvents.push(event.defaultPrevented)
        }
      }}
    />
  )
}
function mountToolbar() {
  const props = {
    browserPageId: 'page',
    workspaceId: 'tab',
    worktreeId: 'work',
    sessionProfileId: null,
    viewportPresetId: null,
    isActive: true,
    canGoBack: false,
    canGoForward: false,
    loading: false,
    webviewRef: { current: null },
    reloadMenuOpen: false,
    setReloadMenuOpen: () => {},
    reloadButtonLabel: 'Reload',
    reloadButtonLabelKind: 'reload' as const,
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
      state: 'idle' as const,
      payload: null,
      error: null,
      contextMenu: false,
      toggle: () => {},
      cancel: () => {},
      rearm: () => {},
      exit: () => {}
    },
    grabIntent: 'copy' as const,
    startGrabIntent: () => {},
    isBlankTab: true,
    markupIsActive: false,
    markupStart: async () => {},
    markupCancel: () => {},
    grabElementShortcut: '',
    browserAnnotationsLength: 0,
    shareableArtifactFile: { filePath: '/fake/report.html' },
    currentBrowserUrl: 'file:///fake/report.html',
    externalUrl: null
  }
  return render(
    <TooltipProvider>
      <BrowserPageToolbar {...props} />
    </TooltipProvider>
  )
}
async function openMenu() {
  const trigger = screen.getByRole('button', { name: 'Browser menu' })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  await screen.findByRole('menu')
  return trigger
}
const stat = vi.fn(async () => ({ isDirectory: false, size: 24 }))
const readFile = vi.fn(async (_request: { filePath: string }) => ({
  content: '<html>fake report</html>',
  isBinary: false
}))
let previousStore = useAppStore.getState()
let previousApi: PropertyDescriptor | undefined
beforeEach(() => {
  previousStore = useAppStore.getState()
  previousApi = Object.getOwnPropertyDescriptor(window, 'api')
  useAppStore.setState({
    settings: { ...getDefaultSettings('/fake-profile'), artifactSharingEnabled: true },
    orcaProfileAuthStatus: {
      activeProfileId: 'fake-profile',
      configured: true,
      state: 'connected',
      persistence: 'memory-only'
    }
  })
  Object.defineProperty(window, 'api', { configurable: true, value: { fs: { stat, readFile } } })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(previousStore, true)
  expect(useAppStore.getState()).toBe(previousStore)
  if (previousApi) {
    Object.defineProperty(window, 'api', previousApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
  closeEvents.length = 0
  provider.requests.length = 0
  vi.clearAllMocks()
})
it('forwards page artifact props and folded control into the actual publish consumer without external publication', async () => {
  mountToolbar()
  const trigger = await openMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Share as artifact' }))
  const popover = await screen.findByRole('dialog')
  await waitFor(() => expect(document.activeElement).toBe(popover))
  expect(screen.queryByRole('menu')).toBeNull()
  expect(closeEvents).toEqual([true])
  await waitFor(() => expect(provider.lookup).toHaveBeenCalledExactlyOnceWith('/fake/report.html'))
  expect(readFile).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Generate link' }))
  await waitFor(() =>
    expect(provider.requests).toEqual([
      {
        sourceKey: '/fake/report.html',
        content: '<html>fake report</html>',
        contentType: 'text/html',
        fileName: 'report.html'
      }
    ])
  )
  expect(stat).toHaveBeenCalledOnce()
  expect(readFile).toHaveBeenCalledOnce()
  expect(readFile.mock.calls[0]?.[0]).toMatchObject({ filePath: '/fake/report.html' })
  expect(provider.publish).toHaveBeenCalledOnce()
  fireEvent.keyDown(popover, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(trigger))
})
