// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { seedBrowserOverlayFocusOwner } from '../assemble-chrome/browser-overlay-focus.test-fixture'
import { DocPreviewDocumentChip } from './doc-preview-document-chip'
import { DocPreviewAddressEdit } from './doc-preview-address-edit'
import { DocPreviewToolbar } from './doc-preview-toolbar'
const initial = useAppStore.getInitialState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
const identity = {
  absolutePath: '/fixture/doc.html',
  directoryPrefix: '',
  fileName: 'doc.html',
  hostLabel: null
}
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  vi.useRealTimers()
  if (api) {
    Object.defineProperty(window, 'api', api)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
function setup() {
  seedBrowserOverlayFocusOwner()
  const clipboard = vi.fn(async () => {})
  Reflect.set(window.api.ui, 'writeClipboardText', clipboard)
  return clipboard
}
it('the product address caller always enters edit and never invokes its chip copy fallback', async () => {
  const clipboard = setup()
  render(
    <TooltipProvider>
      <DocPreviewAddressEdit identity={identity} previewId="page" worktreeId="folder:fixture" />
    </TooltipProvider>
  )
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Edit address' })))
  expect(screen.getByRole('combobox')).not.toBeNull()
  expect(clipboard).not.toHaveBeenCalled()
})
it('the isolated no-edit chip fallback has working fake clipboard feedback but is not the product caller', async () => {
  const clipboard = setup()
  render(
    <TooltipProvider>
      <DocPreviewDocumentChip identity={identity} />
    </TooltipProvider>
  )
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy file path' })))
  expect(clipboard).toHaveBeenCalledWith('/fixture/doc.html')
  expect(screen.getByRole('button', { name: 'Copied' })).not.toBeNull()
})
it('document overflow closes with default trigger DOM focus and no deferred share action', async () => {
  const clipboard = setup()
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, 0, 30)
  )
  const start = vi.fn(),
    markup = vi.fn(),
    external = vi.fn()
  const props = {
    identity,
    previewId: 'page',
    worktreeId: 'folder:fixture',
    history: {
      canGoBack: false,
      canGoForward: false,
      goBack: vi.fn(),
      goForward: vi.fn(),
      sync: vi.fn(),
      reset: vi.fn()
    },
    loading: false,
    onReload: vi.fn(),
    onHardReload: vi.fn(),
    onCopyPath: vi.fn(),
    onCopyRelativePath: vi.fn(),
    onOpenSource: vi.fn(),
    onOpenExternally: external,
    elementTools: {
      activeIntent: null,
      onStartIntent: start,
      disabled: false,
      grabShortcutLabel: '',
      annotationCount: 0
    },
    markupActive: false,
    onToggleMarkup: markup,
    markupDisabled: false,
    reloadMenuOpen: false,
    setReloadMenuOpen: vi.fn()
  }
  render(
    <TooltipProvider>
      <DocPreviewToolbar {...props} />
    </TooltipProvider>
  )
  const trigger = screen.getByRole('button', { name: 'Preview options' })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  await act(async () => {})
  const menu = screen.getByRole('menu')
  expect(screen.queryByText('Share as artifact')).toBeNull()
  vi.useFakeTimers()
  fireEvent.keyDown(menu, { key: 'Escape' })
  await act(async () => {
    vi.runOnlyPendingTimers()
  })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(start).not.toHaveBeenCalled()
  expect(markup).not.toHaveBeenCalled()
  expect(external).not.toHaveBeenCalled()
  expect(clipboard).not.toHaveBeenCalled()
})
