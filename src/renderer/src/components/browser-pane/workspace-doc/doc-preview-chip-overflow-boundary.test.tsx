// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DocPreviewToolbar } from './doc-preview-toolbar'
import type * as OverflowMenuModule from './doc-preview-overflow-menu'
import { TooltipProvider } from '../../ui/tooltip'
import { useAppStore } from '../../../store'

const observation = vi.hoisted((): { closePrevented: boolean[] } => ({ closePrevented: [] }))
vi.mock('../assemble-chrome/use-browser-chrome-tool-fold', () => ({
  BROWSER_CHROME_FOLD_ORDER: ['external'],
  useBrowserChromeToolFold: () => new Set(['external'])
}))
vi.mock('../annotate/MarkupDrawButton', () => ({ MarkupDrawButton: () => null }))
vi.mock('./doc-preview-overflow-menu', async (importOriginal) => {
  const actual = await importOriginal<typeof OverflowMenuModule>()
  return {
    ...actual,
    DocPreviewOverflowMenu: (props: React.ComponentProps<typeof actual.DocPreviewOverflowMenu>) => (
      <actual.DocPreviewOverflowMenu
        {...props}
        overflow={{
          ...props.overflow,
          onMenuCloseAutoFocus: (event) => {
            props.overflow.onMenuCloseAutoFocus(event)
            observation.closePrevented.push(event.defaultPrevented)
          }
        }}
      />
    )
  }
})
const write = vi.fn(async () => {})
const read = vi.fn(async () => 'unchanged-fake-clipboard')
let previousStore = useAppStore.getState()
const previousApi = Object.getOwnPropertyDescriptor(window, 'api')
beforeEach(() => {
  previousStore = useAppStore.getState()
  useAppStore.setState({
    activeView: 'terminal',
    activeModal: 'none',
    persistedUIReady: true,
    browserUrlHistory: [],
    workspaceDocHistory: []
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { writeClipboardText: write, readClipboardText: read } }
  })
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
  write.mockClear()
  read.mockClear()
  observation.closePrevented.length = 0
})
function mountToolbar() {
  const noop = () => {}
  const props = {
    identity: {
      absolutePath: '/fake/docs/readme.html',
      directoryPrefix: 'docs/',
      fileName: 'readme.html',
      hostLabel: 'Fake host'
    },
    previewId: 'fake-doc-preview',
    worktreeId: 'folder:fake',
    history: {
      canGoBack: false,
      canGoForward: false,
      goBack: noop,
      goForward: noop,
      sync: noop,
      reset: noop
    },
    loading: false,
    onReload: noop,
    onHardReload: noop,
    onCopyPath: noop,
    onCopyRelativePath: noop,
    onOpenSource: noop,
    onOpenExternally: noop,
    elementTools: {
      activeIntent: null,
      onStartIntent: noop,
      disabled: true,
      grabShortcutLabel: '',
      annotationCount: 0
    },
    markupActive: false,
    onToggleMarkup: noop,
    markupDisabled: true,
    reloadMenuOpen: false,
    setReloadMenuOpen: noop
  }
  return render(
    <TooltipProvider>
      <DocPreviewToolbar {...props} />
    </TooltipProvider>
  )
}
it('uses the actual product chip caller to enter address editing without reaching the clipboard fallback', async () => {
  const view = mountToolbar()
  expect(screen.queryByRole('button', { name: 'Copy file path' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Edit address' }))
  const input = await waitFor(() => {
    const candidate = view.container.querySelector('input')
    expect(candidate).not.toBeNull()
    return candidate
  })
  expect(input?.value).toBe('docs/readme.html')
  expect(document.activeElement).toBe(input)
  expect(input?.selectionStart).toBe(0)
  expect(input?.selectionEnd).toBe('docs/readme.html'.length)
  expect(write).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
})
it('keeps document overflow close focus with Radix because its actual toolbar has no deferred share action', async () => {
  mountToolbar()
  const trigger = screen.getByRole('button', { name: 'Preview options' })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  const menu = await screen.findByRole('menu')
  expect(screen.queryByRole('menuitem', { name: 'Share as artifact' })).toBeNull()
  fireEvent.keyDown(menu, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(trigger))
  expect(observation.closePrevented).toEqual([false])
  expect(write).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
})
