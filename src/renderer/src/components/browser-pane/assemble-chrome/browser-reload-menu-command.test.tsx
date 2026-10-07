// @vitest-environment happy-dom
import { useRef, useState, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { requestBrowserReloadMenu } from '@/runtime/browser-reload-menu-request'
import type { BrowserReloadMenuAction } from '../../../../../shared/rpc-contract/browser-reload-menu-params'
import { BrowserPageToolbar } from './browser-page-toolbar'
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./use-browser-toolbar-history-commands', () => ({
  useBrowserToolbarHistoryCommands: () => {}
}))
vi.mock('./BrowserAddressBar', () => ({ default: () => null }))
vi.mock('./browser-chrome-toolbar', () => ({
  BrowserChromeToolbar: ({ reloadControl }: { reloadControl: ReactNode }) => <>{reloadControl}</>
}))
const reload = vi.fn()
const refused = vi.fn()
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
async function command(
  action: BrowserReloadMenuAction,
  page = 'toolbar-page',
  expiresAt = Date.now() + 5000
) {
  let response: ReturnType<typeof requestBrowserReloadMenu> | undefined
  await act(async () => {
    response = requestBrowserReloadMenu(page, action, expiresAt)
    void response.catch(() => {})
  })
  if (!response) {
    throw new Error('missing request')
  }
  return response
}
function Owner(props: { active?: boolean; refuse?: boolean }) {
  return (
    <TooltipProvider>
      <ToolbarOwner {...props} />
    </TooltipProvider>
  )
}
it('opens and closes the actual toolbar reload menu through the original state setter', async () => {
  const view = render(<Owner />)
  expect(await command('status')).toEqual({ open: false })
  expect(await command('open')).toEqual({ open: true })
  expect(view.getByRole('menuitem', { name: 'Hard Reload' })).toBeTruthy()
  expect(reload).not.toHaveBeenCalled()
  expect(await command('close')).toEqual({ open: false })
  expect(view.queryByRole('menuitem')).toBeNull()
})
it('shares right-click open and original Reload and Hard Reload callbacks with menu readback', async () => {
  const view = render(<Owner />)
  fireEvent.contextMenu(view.getByRole('button', { name: 'Reload' }))
  expect(await command('status')).toEqual({ open: true })
  const item = await view.findByRole('menuitem', { name: 'Reload' })
  const content = item.closest('[data-slot="dropdown-menu-content"]')
  if (!content) {
    throw new Error('missing reload menu content')
  }
  const closed = new Promise<void>((resolve) => {
    content.addEventListener('focusScope.autoFocusOnUnmount', () => resolve(), { once: true })
  })
  fireEvent.click(item)
  await act(async () => {
    await closed
  })
  expect(reload).toHaveBeenLastCalledWith('reload')
  expect(await command('status')).toEqual({ open: false })
  await command('open')
  fireEvent.click(await view.findByRole('menuitem', { name: 'Hard Reload' }))
  expect(reload).toHaveBeenLastCalledWith('hard-reload')
  expect(await command('status')).toEqual({ open: false })
})
it('refuses inactive, foreign, expired and duplicate active owners before changing menu state', async () => {
  const view = render(<Owner active={false} />)
  await expect(command('open')).rejects.toThrow('inactive')
  await expect(command('open', 'foreign')).rejects.toThrow('unavailable')
  view.rerender(
    <>
      <Owner />
      <Owner />
    </>
  )
  await expect(command('open')).rejects.toThrow('ambiguous')
  expect(view.queryByRole('menuitem')).toBeNull()
  view.rerender(<Owner />)
  await expect(command('open', 'toolbar-page', Date.now() - 1)).rejects.toThrow('expired')
  expect(view.queryByRole('menuitem')).toBeNull()
})
it('selects the only active actual toolbar owner after an inactive owner', async () => {
  const view = render(
    <>
      <Owner active={false} />
      <Owner />
    </>
  )
  expect(await command('open')).toEqual({ open: true })
  expect(view.getAllByRole('menu')).toHaveLength(1)
})
it('does not acknowledge a setter that leaves the original committed menu state unchanged', async () => {
  const view = render(<Owner refuse />)
  await expect(command('open')).rejects.toThrow('not_applied')
  expect(refused).toHaveBeenCalledWith(true)
  expect(view.queryByRole('menuitem')).toBeNull()
  view.unmount()
  await expect(command('status')).rejects.toThrow('unavailable')
})
function ToolbarOwner({ active = true, refuse = false }: { active?: boolean; refuse?: boolean }) {
  const [value, setValue] = useState('about:blank')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLInputElement | null>(null)
  return (
    <BrowserPageToolbar
      browserPageId="toolbar-page"
      workspaceId="workspace-fixture"
      worktreeId="folder-fixture"
      sessionProfileId={null}
      viewportPresetId={null}
      isActive={active}
      canGoBack={false}
      canGoForward={false}
      loading={false}
      webviewRef={{ current: null }}
      reloadMenuOpen={open}
      setReloadMenuOpen={refuse ? refused : setOpen}
      reloadButtonLabel="Reload"
      reloadButtonLabelKind="reload"
      reloadShortcut=""
      hardReloadShortcut=""
      runReloadTrigger={reload}
      addressBarValue={value}
      setAddressBarValue={setValue}
      submitAddressBar={vi.fn()}
      navigateToUrl={vi.fn()}
      addressBarInputRef={ref}
      dismissAddressBarSuggestionsRef={{ current: null }}
      grab={{
        state: 'idle',
        payload: null,
        error: null,
        contextMenu: false,
        toggle: vi.fn(),
        cancel: vi.fn(),
        rearm: vi.fn(),
        exit: vi.fn()
      }}
      grabIntent="copy"
      startGrabIntent={vi.fn()}
      isBlankTab={false}
      markupIsActive={false}
      markupStart={async () => {}}
      markupCancel={vi.fn()}
      grabElementShortcut=""
      browserAnnotationsLength={0}
      shareableArtifactFile={null}
      currentBrowserUrl="about:blank"
      externalUrl={null}
    />
  )
}
