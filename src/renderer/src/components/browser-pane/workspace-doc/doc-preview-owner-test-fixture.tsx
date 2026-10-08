import type { BrowserPage, BrowserWorkspace } from '../../../../../shared/browser-workspace-types'
import { act } from 'react'
import type { DocPreviewFailure } from '../../../../../shared/doc-preview-scheme'
import type { Root } from 'react-dom/client'
import { expect, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type * as WebviewRegistryModule from '../host-guest/webview-registry'

export const GRANT_ID = 'a'.repeat(32)
// The draw-tool hint's own storage key; the hook that owns it keeps it private.
export const MARKUP_DRAW_HINT_SEEN_KEY = 'orca.browser.markup-draw-hint-seen'
export const ENTRY_RELATIVE_PATH = 'docs/reports/index.html'
export const ABSOLUTE_PATH = '/repo/docs/reports/index.html'

const clipboardFixture = vi.hoisted((): { writes: string[] } => ({ writes: [] }))
export const clipboard = clipboardFixture
export const grabCalls: { browserPageId: string; enabled: boolean }[] = []
export const osOpens: string[] = []

vi.mock('@/lib/doc-preview-grants', () => ({
  buildDocPreviewGrantRequest: () => ({
    owner: {
      kind: 'runtime' as const,
      environmentId: 'env-1',
      worktreeSelector: 'id:wt-1',
      worktreeRoot: '/repo'
    },
    root: '/repo',
    entryRelativePath: ENTRY_RELATIVE_PATH
  }),
  ensureDocPreviewGrant: () =>
    Promise.resolve({
      grantId: GRANT_ID,
      url: `orca-preview://${GRANT_ID}/${ENTRY_RELATIVE_PATH}`
    }),
  releaseDocPreviewGrant: () => undefined
}))

vi.mock('@/components/browser-pane/host-guest/webview-registry', async (importOriginal) => ({
  ...(await importOriginal<typeof WebviewRegistryModule>()),
  moveFocusToRendererBeforeWebviewDetach: () => undefined
}))

// The real one walks half the store to decide who owns a worktree; the chip only cares that
// whatever it decides reaches the pill.
vi.mock('@/lib/execution-host-display-label', () => ({
  selectWorktreeHostDisplayLabel: () => 'Studio Mac mini'
}))

const storeFixture = vi.hoisted(() => ({
  openedFiles: [] as unknown[],
  downloads: [] as string[],
  externalOpenAccepted: true,
  pageStateUpdates: [] as { pageId: string; updates: { title?: string } }[],
  conversions: [] as { pageId: string; target: unknown }[]
}))

export const store = storeFixture

// The document lives on the SSH host that owns the workspace, which is what makes the preview a
// preview at all — the client OS has no copy of it.
vi.mock('@/lib/connection-context', () => ({
  getConnectionId: () => 'ssh-1',
  getConnectionIdForFile: () => 'ssh-1',
  getConnectionIdFromState: () => 'ssh-1'
}))

vi.mock('@/lib/connection-owner-resolution', () => ({
  getConnectionIdForFileFromState: () => 'ssh-1'
}))

vi.mock('@/components/terminal-pane/terminal-remote-file-download-open', () => ({
  downloadAndOpenRemoteTerminalFile: (_context: unknown, filePath: string) => {
    store.downloads.push(filePath)
    return Promise.resolve(store.externalOpenAccepted)
  }
}))

export const viewerSettings: { activeRuntimeEnvironmentId: string | null } = {
  activeRuntimeEnvironmentId: 'env-1'
}
const browserTabsByWorktree: Record<string, BrowserWorkspace[]> = {}
const browserPagesByWorkspace: Record<string, BrowserPage[]> = {}
export const storeState = {
  browserTabsByWorktree,
  browserPagesByWorkspace,
  getKnownWorktreeById: () => ({ path: '/repo' }),
  persistedUIReady: true,
  settings: viewerSettings,
  keybindings: {},
  browserAnnotationsByPageId: {} as Record<string, unknown[]>,
  activeGroupIdByWorktree: {} as Record<string, string>,
  agentSendPopoverTargetMode: null,
  openAgentSendPopoverTargetMode: () => undefined,
  closeAgentSendPopoverTargetMode: () => undefined,
  addBrowserPageAnnotation: () => undefined,
  deleteBrowserPageAnnotation: () => undefined,
  clearBrowserPageAnnotations: () => undefined,
  recordFeatureInteraction: () => undefined,
  openFile: (file: unknown) => {
    store.openedFiles.push(file)
    return 'file-1'
  },
  updateBrowserPageState: (pageId: string, updates: { title?: string }) => {
    store.pageStateUpdates.push({ pageId, updates })
  },
  browserUrlHistory: [],
  workspaceDocHistory: [],
  recordWorkspaceDocVisit: () => undefined,
  browserDefaultSearchEngine: 'google',
  browserKagiSessionLink: null,
  convertBrowserPage: (pageId: string, target: unknown) => {
    store.conversions.push({ pageId, target })
    return { id: 'converted-1' }
  }
}

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector?: (state: typeof storeState) => unknown) =>
      selector ? selector(storeState) : storeState,
    { getState: () => storeState }
  )
}))

type StubWebview = Element & {
  canGoBack: () => boolean
  canGoForward: () => boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
}

export async function renderPreview(
  container: HTMLDivElement,
  root: Root,
  options: { holdsGuestFocus?: boolean; isActive?: boolean } = {}
): Promise<StubWebview> {
  const { HtmlDocPreview } = await import('./HtmlDocPreview')
  await act(async () => {
    root.render(
      <TooltipProvider>
        <HtmlDocPreview
          isActive={options.isActive ?? true}
          previewId="preview-1"
          filePath={ABSOLUTE_PATH}
          relativePath={ENTRY_RELATIVE_PATH}
          worktreeId="wt-1"
          holdsGuestFocus={options.holdsGuestFocus ?? false}
        />
      </TooltipProvider>
    )
  })
  const webview = container.querySelector('webview') as StubWebview | null
  expect(webview).not.toBeNull()
  // Why: the tools only arm once something has painted, so every case starts from a settled load.
  await act(async () => {
    webview?.dispatchEvent(new Event('did-stop-loading'))
  })
  return webview as StubWebview
}

export function stubHistory(
  webview: StubWebview,
  depth: { canGoBack: boolean; canGoForward: boolean }
): { goBack: ReturnType<typeof vi.fn>; goForward: ReturnType<typeof vi.fn> } {
  const goBack = vi.fn()
  const goForward = vi.fn()
  webview.canGoBack = () => depth.canGoBack
  webview.canGoForward = () => depth.canGoForward
  webview.goBack = goBack
  webview.goForward = goForward
  webview.reload = vi.fn()
  return { goBack, goForward }
}

export function button(container: HTMLDivElement, label: string): HTMLButtonElement {
  const element = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(element).not.toBeNull()
  return element as HTMLButtonElement
}

export const provider: {
  onFailure: ((failure: DocPreviewFailure) => void) | undefined
  authorize: ReturnType<typeof vi.fn<(grantId: string, path: string) => Promise<boolean>>>
} = {
  onFailure: undefined,
  authorize: vi.fn<(grantId: string, path: string) => Promise<boolean>>()
}
export function installDocPreviewTestApi(): void {
  provider.onFailure = undefined
  provider.authorize.mockReset().mockResolvedValue(true)
  clipboard.writes = []
  store.openedFiles = []
  store.conversions = []
  store.downloads = []
  store.externalOpenAccepted = true
  grabCalls.length = 0
  osOpens.length = 0
  ;(window as unknown as { api: unknown }).api = {
    docPreview: {
      authorizeDirectory: provider.authorize,
      onLoadFailure: (callback: (failure: DocPreviewFailure) => void) => {
        provider.onFailure = callback
        return () => {
          provider.onFailure = undefined
        }
      }
    },
    ui: {
      writeClipboardText: (text: string) => {
        clipboard.writes.push(text)
        return Promise.resolve()
      },
      readClipboardText: () => Promise.resolve(clipboard.writes.at(-1) ?? ''),
      writeClipboardImage: () => Promise.resolve()
    },
    shell: {
      openFilePath: (filePath: string) => {
        osOpens.push(filePath)
        return Promise.resolve(true)
      }
    },
    browser: {
      unregisterGuest: () => Promise.resolve(),
      setGrabMode: (args: { browserPageId: string; enabled: boolean }) => {
        grabCalls.push(args)
        return Promise.resolve({ ok: true })
      },
      cancelGrab: () => Promise.resolve(true),
      awaitGrabSelection: () => new Promise(() => {}),
      captureSelectionScreenshot: () => Promise.resolve({ ok: false }),
      setAnnotationViewportBridge: () => Promise.resolve(true)
    }
  }
}
