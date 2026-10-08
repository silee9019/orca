// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { BrowserChromeToolbar } from '../assemble-chrome/browser-chrome-toolbar'
import { applyBrowserViewerRequest } from '@/runtime/browser-viewer-bridge'
import { getDefaultSettings } from '../../../../../shared/constants'
import { installClientHostedPaneApi } from '../client-hosted-browser-pane-test-rig'
import { useMarkupMode } from './useMarkupMode'
const capture = vi.hoisted(() => vi.fn())
vi.mock('./markup-base-image', () => ({ captureMarkupBaseImage: capture }))
const initial = useAppStore.getInitialState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  localStorage.removeItem('orca.browser.markup-draw-hint-seen')
  if (api) {
    Object.defineProperty(window, 'api', api)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('passes the chrome tool owner to the actual draw button and starts the original capture mode', async () => {
  capture.mockResolvedValue({ dataUrl: 'captured', width: 100, height: 80 })
  localStorage.removeItem('orca.browser.markup-draw-hint-seen')
  installClientHostedPaneApi()
  useAppStore.setState({
    settings: getDefaultSettings('fixture'),
    persistedUIReady: true,
    activeModal: 'none',
    activeWorktreeId: 'folder:fixture'
  })
  useAppStore
    .getState()
    .createBrowserTab('folder:fixture', 'about:blank', { browserPageId: 'page' })
  function Owner() {
    const mode = useMarkupMode({
      getCaptureContext: () => ({
        source: { kind: 'image', element: new Image() },
        cssWidth: 100,
        cssHeight: 80,
        outputScale: 1
      }),
      onDeliver: vi.fn()
    })
    return (
      <TooltipProvider>
        <BrowserChromeToolbar
          controls={{
            canGoBack: false,
            canGoForward: false,
            loading: false,
            goBack: vi.fn(),
            goForward: vi.fn(),
            reload: vi.fn(),
            navigate: vi.fn()
          }}
          addressSlot={null}
          elementTools={null}
          markup={{
            commandOwner: { page: 'page', active: true },
            active: mode.isActive,
            disabled: false,
            canShowDiscoveryHint: true,
            onToggle: () => (mode.isActive ? mode.cancel() : void mode.start())
          }}
          viewSource={null}
          openExternal={null}
          overflowMenu={() => null}
        />
      </TooltipProvider>
    )
  }
  const view = render(<Owner />)
  expect(view.getByText('Got it')).toBeTruthy()
  const request = () =>
    applyBrowserViewerRequest({
      id: 'fixture',
      expiresAt: Date.now() + 1000,
      command: { viewer: 'host', operation: 'markup-hint', page: 'page', action: 'toggle' }
    })
  let pending: ReturnType<typeof request> | undefined
  await act(async () => {
    pending = request()
    void pending.catch(() => {})
  })
  await expect(pending).resolves.toMatchObject({
    applied: true,
    rendered: false,
    persisted: false,
    markupHint: { hintOpen: false, active: true }
  })
  expect(capture).toHaveBeenCalledOnce()
  expect(
    view.getByRole('button', { name: 'Draw on screenshot' }).getAttribute('aria-pressed')
  ).toBe('true')
  await act(async () => {
    pending = request()
    void pending.catch(() => {})
  })
  await expect(pending).resolves.toMatchObject({
    applied: true,
    markupHint: { hintOpen: false, active: false }
  })
})
