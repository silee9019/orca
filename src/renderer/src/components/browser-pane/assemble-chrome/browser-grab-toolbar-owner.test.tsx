// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { useMarkupMode } from '../annotate/useMarkupMode'
import { useGrabMode } from '../annotate/useGrabMode'
import { BrowserPageToolbar } from './browser-page-toolbar'
import { requestBrowserGrab, type BrowserGrabState } from '@/runtime/browser-grab-request'
import { useBrowserPageGrabAnnotations } from '../annotate/use-browser-page-grab-annotations'
import { useState } from 'react'
import { installClientHostedPaneApi } from '../client-hosted-browser-pane-test-rig'
const native = {
  setGrabMode: vi.fn().mockResolvedValue({ ok: true }),
  cancelGrab: vi.fn().mockResolvedValue(true),
  awaitGrabSelection: vi.fn(() => new Promise(() => {}))
}
const capture = vi.hoisted(() => vi.fn())
vi.mock('../annotate/markup-base-image', () => ({ captureMarkupBaseImage: capture }))
vi.mock('./BrowserAddressBar', () => ({ default: () => null }))
vi.mock('./BrowserImportHintButton', () => ({ browserImportHintControl: () => () => null }))
vi.mock('./BrowserToolbarMenu', () => ({ BrowserToolbarMenu: () => null }))
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
function mount() {
  installClientHostedPaneApi()
  Object.assign(window.api.browser, native)
  native.setGrabMode.mockClear()
  native.cancelGrab.mockClear()
  native.awaitGrabSelection.mockClear()
  useAppStore.setState({ persistedUIReady: true })
  localStorage.removeItem('orca.browser.markup-draw-hint-seen')
  capture.mockReset().mockResolvedValue({ dataUrl: 'captured', width: 100, height: 80 })
  function Owner({ isActive, isBlankTab }: { isActive: boolean; isBlankTab: boolean }) {
    const grab = useGrabMode('page')
    const [trayOpen, setTrayOpen] = useState(false)
    const annotations = useBrowserPageGrabAnnotations({
      browserTabId: 'page',
      isActive,
      grabCommandDisabled: isBlankTab,
      grab,
      containerRef: { current: null },
      webviewRef: { current: null },
      setBrowserOverlayViewport: () => {},
      browserAnnotationsLength: 0,
      setBrowserAnnotationTrayOpen: setTrayOpen
    })
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
        <output data-testid="tray-open">{String(trayOpen)}</output>
        <BrowserPageToolbar
          browserPageId="page"
          workspaceId="workspace"
          worktreeId="folder:fixture"
          sessionProfileId={null}
          viewportPresetId={null}
          isActive={isActive}
          canGoBack={false}
          canGoForward={false}
          loading={false}
          webviewRef={{ current: null }}
          reloadMenuOpen={false}
          setReloadMenuOpen={vi.fn()}
          reloadButtonLabel="Reload"
          reloadButtonLabelKind="reload"
          reloadShortcut=""
          hardReloadShortcut=""
          runReloadTrigger={vi.fn()}
          addressBarValue="https://example.test"
          setAddressBarValue={vi.fn()}
          submitAddressBar={vi.fn()}
          navigateToUrl={vi.fn()}
          addressBarInputRef={{ current: null }}
          dismissAddressBarSuggestionsRef={{ current: null }}
          grab={grab}
          grabIntent={annotations.grabIntent}
          startGrabIntent={annotations.startGrabIntent}
          isBlankTab={isBlankTab}
          markupIsActive={mode.isActive}
          markupStart={mode.start}
          markupCancel={mode.cancel}
          grabElementShortcut="G"
          browserAnnotationsLength={0}
          shareableArtifactFile={null}
          currentBrowserUrl="https://example.test"
          externalUrl={null}
        />
      </TooltipProvider>
    )
  }
  const view = render(<Owner isActive isBlankTab={false} />)
  return {
    view,
    duplicate: () => render(<Owner isActive isBlankTab={false} />),
    inactive: () => view.rerender(<Owner isActive={false} isBlankTab={false} />),
    blank: () => view.rerender(<Owner isActive isBlankTab />)
  }
}
async function toggle(intent: 'copy' | 'annotate') {
  let pending: Promise<BrowserGrabState> | undefined
  await act(async () => {
    pending = requestBrowserGrab('page', 'toggle', Date.now() + 1000, intent)
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing request')
  }
  return pending
}
it('shares native toolbar copy/annotate buttons and typed intent switching without restarting selection', async () => {
  const { view } = mount()
  fireEvent.click(view.getByRole('button', { name: 'Grab page element' }))
  await waitFor(() => expect(native.awaitGrabSelection).toHaveBeenCalledOnce())
  expect(await toggle('annotate')).toMatchObject({ state: 'awaiting', intent: 'annotate' })
  expect(view.getByTestId('tray-open').textContent).toBe('true')
  expect(native.awaitGrabSelection).toHaveBeenCalledOnce()
  expect(native.cancelGrab).not.toHaveBeenCalled()
  expect(await toggle('annotate')).toMatchObject({ state: 'idle', intent: 'annotate' })
  expect(native.cancelGrab).toHaveBeenCalledWith({ browserPageId: 'page' })
})
it('uses the same copy owner after the actual annotate button starts the native picker', async () => {
  const { view } = mount()
  fireEvent.click(view.getByRole('button', { name: 'Annotate page element' }))
  await waitFor(() => expect(native.awaitGrabSelection).toHaveBeenCalledOnce())
  expect(await toggle('copy')).toMatchObject({ state: 'awaiting', intent: 'copy' })
  expect(native.awaitGrabSelection).toHaveBeenCalledOnce()
  expect(await toggle('copy')).toMatchObject({ state: 'idle', intent: 'copy' })
})
it('refuses duplicate active toolbar owners before either picker is started', async () => {
  const { duplicate } = mount()
  duplicate()
  await expect(toggle('copy')).rejects.toThrow('ambiguous')
  expect(native.setGrabMode).not.toHaveBeenCalled()
})

it('chooses the unique active toolbar after an inactive matching surface offers first', async () => {
  const first = mount()
  first.inactive()
  first.duplicate()
  expect(await toggle('copy')).toMatchObject({ state: 'awaiting', intent: 'copy' })
  expect(native.setGrabMode).toHaveBeenCalledOnce()
})
