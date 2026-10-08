// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { useMarkupMode } from '../annotate/useMarkupMode'
import { useGrabMode } from '../annotate/useGrabMode'
import { BrowserPageToolbar } from './browser-page-toolbar'
import { requestBrowserMarkupHint } from '@/runtime/browser-markup-hint-request'
import { installClientHostedPaneApi } from '../client-hosted-browser-pane-test-rig'
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
  useAppStore.setState({ persistedUIReady: true })
  localStorage.removeItem('orca.browser.markup-draw-hint-seen')
  capture.mockReset().mockResolvedValue({ dataUrl: 'captured', width: 100, height: 80 })
  function Owner({ isActive, isBlankTab }: { isActive: boolean; isBlankTab: boolean }) {
    const grab = useGrabMode('')
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
          grabIntent="copy"
          startGrabIntent={vi.fn()}
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
    inactive: () => view.rerender(<Owner isActive={false} isBlankTab={false} />),
    blank: () => view.rerender(<Owner isActive isBlankTab />)
  }
}
it('uses the actual native page toolbar owner to dismiss the hint and start the original markup mode', async () => {
  const { view } = mount()
  let pending: ReturnType<typeof requestBrowserMarkupHint> | undefined
  await act(async () => {
    pending = requestBrowserMarkupHint('page', 'toggle', Date.now() + 1000)
    void pending.catch(() => {})
  })
  await expect(pending).resolves.toMatchObject({ hintOpen: false, active: true })
  expect(capture).toHaveBeenCalledOnce()
  expect(
    view.getByRole('button', { name: 'Draw on screenshot' }).getAttribute('aria-pressed')
  ).toBe('true')
})
it('refuses inactive and blank native page toolbar owners before capture', async () => {
  const view = mount()
  view.inactive()
  await expect(requestBrowserMarkupHint('page', 'toggle', Date.now() + 1000)).rejects.toThrow(
    'browser_markup_hint_inactive'
  )
  view.blank()
  await expect(requestBrowserMarkupHint('page', 'toggle', Date.now() + 1000)).rejects.toThrow(
    'browser_markup_hint_inactive'
  )
  expect(capture).not.toHaveBeenCalled()
})
