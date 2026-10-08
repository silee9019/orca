// @vitest-environment happy-dom
import { act, cleanup, renderHook, render, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { requestBrowserMarkup } from '@/runtime/browser-markup-request'
import { requestBrowserMarkupEditor } from '@/runtime/browser-markup-editor-request'
import { BrowserGuestAnnotateOverlays } from '../annotate/browser-guest-annotate-overlays'
import { makeBrowserGuestOverlayFixture } from '../annotate/browser-guest-overlay-test-fixture'
import { useAppStore } from '@/store'
import { applyBrowserViewerRequest } from '@/runtime/browser-viewer-bridge'
import { getDefaultSettings } from '../../../../../shared/constants'
import { installClientHostedPaneApi } from '../client-hosted-browser-pane-test-rig'
import { useDocPreviewGuestTools } from './use-doc-preview-guest-tools'
const capture = vi.hoisted(() => vi.fn())
const compose = vi.hoisted(() => vi.fn())
const write = vi.hoisted(() => vi.fn())
const api = Object.getOwnPropertyDescriptor(window, 'api')
const initial = useAppStore.getInitialState()
vi.mock(import('../annotate/markup-screenshot-compose'), async (original) => ({
  ...(await original()),
  composeMarkupDataUrl: compose
}))
vi.mock('../annotate/browser-page-annotation-tray', () => ({
  BrowserPageAnnotationTray: () => null
}))
vi.mock('../annotate/pending-browser-annotation-card', () => ({
  PendingBrowserAnnotationCard: () => null
}))
vi.mock('../annotate/markup-base-image', () => ({ captureMarkupBaseImage: capture }))
vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutLabel: () => 'G' }))
vi.mock('../annotate/guest-annotation-viewport-bridge', () => ({
  syncGuestAnnotationViewportBridge: vi.fn()
}))
vi.mock('../annotate/use-browser-page-annotation-send', () => ({
  useBrowserPageAnnotationSend: () => ({
    browserAnnotations: [],
    setBrowserAnnotationTrayOpen: vi.fn()
  })
}))
vi.mock('../annotate/use-browser-page-grab-annotations', () => ({
  useBrowserPageGrabAnnotations: () => ({ pendingAnnotationPayload: null })
}))
vi.mock('../annotate/useGrabMode', () => ({ useGrabMode: () => ({ state: 'idle' }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
beforeEach(() => {
  capture.mockReset().mockResolvedValue({ dataUrl: 'captured', width: 100, height: 80 })
  compose
    .mockReset()
    .mockResolvedValue({ dataUrl: 'data:image/png;base64,fixture', width: 100, height: 80 })
  write.mockReset().mockResolvedValue({ written: true })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { writeVerifiedClipboardImage: write } }
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
function mount() {
  const webview = document.createElement('webview')
  Object.defineProperty(webview, 'getBoundingClientRect', {
    value: () => ({ width: 100, height: 80 })
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Capture only reads the fixture guest bounding rectangle; image capture is the explicit provider boundary.
  const webviewRef = { current: webview as Electron.WebviewTag }
  return renderHook(
    ({ grantId, isActive, toolsReady }) =>
      useDocPreviewGuestTools({
        previewId: 'document',
        worktreeId: 'folder:fixture',
        grantId,
        isActive,
        toolsReady,
        webviewRef,
        containerRef: { current: null }
      }),
    { initialProps: { grantId: 'grant-a', isActive: true, toolsReady: true } }
  )
}
it('captures and cancels through the actual document tool owner', async () => {
  const view = mount()
  let pending: ReturnType<typeof requestBrowserMarkup> | undefined
  await act(async () => {
    pending = requestBrowserMarkup('document', 'start', Date.now() + 1000)
    void pending.catch(() => {})
  })
  await expect(pending).resolves.toMatchObject({ state: 'drawing', hasImage: true })
  expect(capture).toHaveBeenCalledOnce()
  expect(view.result.current.markup.commandOwner).toMatchObject({ page: 'document', active: true })
  await act(async () => {
    pending = requestBrowserMarkup('document', 'cancel', Date.now() + 1000)
    void pending.catch(() => {})
  })
  await expect(pending).resolves.toMatchObject({ state: 'idle', hasImage: false })
})
it.each([
  { isActive: false, toolsReady: true },
  { isActive: true, toolsReady: false }
])('refuses inactive or unready retained previews %j', async (props) => {
  const view = mount()
  view.rerender({ grantId: 'grant-a', ...props })
  await expect(requestBrowserMarkup('document', 'start', Date.now() + 1000)).rejects.toThrow(
    'browser_markup_viewer_inactive'
  )
  expect(capture).not.toHaveBeenCalled()
})
it.each(['grant', 'reload'])(
  'refuses the old capture after the document %s is replaced',
  async (change) => {
    let resolveCapture: (value: {
      dataUrl: string
      width: number
      height: number
    }) => void = () => {
      throw new Error('capture not started')
    }
    capture.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve
        })
    )
    const view = mount()
    let pending: ReturnType<typeof requestBrowserMarkup> | undefined
    await act(async () => {
      pending = requestBrowserMarkup('document', 'start', Date.now() + 1000)
      void pending.catch(() => {})
    })
    if (change === 'grant') {
      view.rerender({ grantId: 'grant-b', isActive: true, toolsReady: true })
    } else {
      view.rerender({ grantId: 'grant-a', isActive: true, toolsReady: false })
      view.rerender({ grantId: 'grant-a', isActive: true, toolsReady: true })
    }
    await act(async () => resolveCapture({ dataUrl: 'stale', width: 100, height: 80 }))
    await expect(pending).rejects.toThrow('browser_markup_owner_changed_effect_unknown')
    expect(view.result.current.markup.state).toBe('idle')
  }
)

function mountOverlay() {
  const target = document.createElement('div')
  document.body.append(target)
  const props = makeBrowserGuestOverlayFixture(target)
  const webview = document.createElement('webview')
  Object.defineProperty(webview, 'getBoundingClientRect', {
    value: () => ({ width: 100, height: 80 })
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The fixture guest provides capture geometry; image capture is mocked at its provider boundary.
  const webviewRef = { current: webview as Electron.WebviewTag }
  function Owner({ grantId, toolsReady = true }: { grantId: string; toolsReady?: boolean }) {
    const tools = useDocPreviewGuestTools({
      previewId: 'document',
      worktreeId: 'folder:fixture',
      grantId,
      isActive: true,
      toolsReady,
      webviewRef,
      containerRef: { current: null }
    })
    return <BrowserGuestAnnotateOverlays {...props} markup={tools.markup} />
  }
  const view = render(<Owner grantId="grant-a" />)
  return {
    target,
    view,
    replace: () => view.rerender(<Owner grantId="grant-b" />),
    reload: () => {
      view.rerender(<Owner grantId="grant-a" toolsReady={false} />)
      view.rerender(<Owner grantId="grant-a" toolsReady />)
    }
  }
}
async function startOverlay(target: HTMLDivElement) {
  let pending: ReturnType<typeof requestBrowserMarkup> | undefined
  await act(async () => {
    pending = requestBrowserMarkup('document', 'start', Date.now() + 1000)
    void pending.catch(() => {})
  })
  await expect(pending).resolves.toMatchObject({ state: 'drawing', hasImage: true })
  const image = target.querySelector('img')
  if (!image) {
    throw new Error('missing document markup image')
  }
  fireEvent.load(image)
}
it('edits and copies through the original document overlay and verified clipboard owner', async () => {
  const { target } = mountOverlay()
  try {
    await startOverlay(target)
    let pending: ReturnType<typeof requestBrowserMarkupEditor> | undefined
    await act(async () => {
      pending = requestBrowserMarkupEditor(
        'document',
        { action: 'tool', value: 'rect' },
        Date.now() + 1000
      )
    })
    await expect(pending).resolves.toMatchObject({ tool: 'rect' })
    await act(async () => {
      pending = requestBrowserMarkupEditor('document', { action: 'copy' }, Date.now() + 1000)
    })
    await expect(pending).resolves.toMatchObject({ copied: true })
    expect(write).toHaveBeenCalledExactlyOnceWith('data:image/png;base64,fixture')
    expect(target.querySelector('[data-orca-markup-overlay]')).toBeNull()
  } finally {
    target.remove()
  }
})
it.each(['grant', 'reload'])(
  'rejects the old overlay copy before writing after a %s replacement',
  async (change) => {
    let resolveCompose: (value: {
      dataUrl: string
      width: number
      height: number
    }) => void = () => {
      throw new Error('compose not started')
    }
    compose.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCompose = resolve
        })
    )
    const { target, replace, reload } = mountOverlay()
    try {
      await startOverlay(target)
      let pending: ReturnType<typeof requestBrowserMarkupEditor> | undefined
      await act(async () => {
        pending = requestBrowserMarkupEditor('document', { action: 'copy' }, Date.now() + 1000)
        void pending.catch(() => {})
      })
      if (change === 'grant') {
        replace()
      } else {
        reload()
      }
      await act(async () => resolveCompose({ dataUrl: 'stale', width: 100, height: 80 }))
      await expect(pending).rejects.toThrow('browser_markup_copy_effect_unknown')
      expect(write).not.toHaveBeenCalled()
    } finally {
      target.remove()
    }
  }
)

it('routes the existing viewer markup command to the document page owner', async () => {
  installClientHostedPaneApi({ ui: { writeVerifiedClipboardImage: write } })
  useAppStore.setState({
    settings: getDefaultSettings('fixture'),
    persistedUIReady: true,
    activeModal: 'none',
    activeWorktreeId: 'folder:fixture'
  })
  useAppStore
    .getState()
    .createBrowserTab('folder:fixture', 'about:blank', { browserPageId: 'document' })
  useAppStore.setState((state) => ({
    browserPagesByWorkspace: Object.fromEntries(
      Object.entries(state.browserPagesByWorkspace).map(([workspace, pages]) => [
        workspace,
        pages.map((page) => ({
          ...page,
          docLocation: {
            kind: 'workspace-doc' as const,
            worktreeId: 'folder:fixture',
            filePath: 'notes.html'
          }
        }))
      ])
    )
  }))
  mount()
  const request = (action: 'start' | 'cancel') =>
    applyBrowserViewerRequest({
      id: 'fixture',
      expiresAt: Date.now() + 1000,
      command: { viewer: 'host', operation: 'markup', page: 'document', action }
    })
  let pending: ReturnType<typeof request> | undefined
  await act(async () => {
    pending = request('start')
    void pending.catch(() => {})
  })
  await expect(pending).resolves.toMatchObject({
    applied: true,
    persisted: false,
    rendered: false,
    markup: { state: 'drawing', hasImage: true }
  })
  await act(async () => {
    pending = request('cancel')
    void pending.catch(() => {})
  })
  await expect(pending).resolves.toMatchObject({
    applied: true,
    markup: { state: 'idle', hasImage: false }
  })
})
