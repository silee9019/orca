// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { BrowserContextMenuRequestedEvent } from '../../../../../shared/browser-guest-events'
import type { BrowserPage } from '../../../../../shared/browser-workspace-types'
import { requestBrowserContextMenu } from '@/runtime/browser-context-menu-request'
import { useBrowserPageReloadActions } from '../navigate/use-browser-page-reload-actions'
import { BrowserPageContextMenu } from './browser-page-context-menu'
const fixture = vi.hoisted(() => {
  let requested: ((event: BrowserContextMenuRequestedEvent) => void) | undefined
  return {
    get requested() {
      return requested
    },
    set requested(value: ((event: BrowserContextMenuRequestedEvent) => void) | undefined) {
      requested = value
    }
  }
})
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { createBrowserTab: () => void }) => unknown) =>
    selector({ createBrowserTab: () => {} })
}))
vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutLabel: () => '' }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/lib/ui-zoom', () => ({ windowDipToCssPx: (value: number) => value }))
afterEach(cleanup)
const page: BrowserPage = {
  id: 'page',
  workspaceId: 'workspace',
  worktreeId: 'folder',
  createdAt: 1,
  url: 'https://reload.invalid/',
  title: 'Fixture',
  loading: false,
  loadError: null,
  faviconUrl: null,
  canGoBack: false,
  canGoForward: false
}
it.each([false, true])(
  'links the native context reload callback to the existing reload owner, guestMissing=%s',
  async (missingGuest) => {
    const guestReload = vi.fn(),
      recover = vi.fn(),
      update = vi.fn()
    const guest = Object.assign(document.createElement('webview'), {
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: guestReload,
      getWebContentsId: () => {
        if (missingGuest) {
          throw new Error('guest missing')
        }
        return 1
      }
    })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The context menu and reload owners use only the DOM and guest methods supplied above.
    const webviewRef = { current: guest as unknown as Electron.WebviewTag }
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        browser: {
          onContextMenuRequested: (callback: (event: BrowserContextMenuRequestedEvent) => void) => {
            fixture.requested = callback
            return () => {
              fixture.requested = undefined
            }
          },
          onContextMenuDismissed: () => () => {}
        }
      }
    })
    function Owner() {
      const reload = useBrowserPageReloadActions({
        browserTab: page,
        webviewRef,
        retryGuestRecoveryRef: { current: recover },
        onUpdatePageStateRef: { current: update }
      })
      return (
        <BrowserPageContextMenu
          browserPageId={page.id}
          worktreeId={page.worktreeId}
          isActive={true}
          canGoBack={false}
          canGoForward={false}
          webviewRef={webviewRef}
          onReload={() => reload.reloadWebviewOrRecoverGuest(false)}
        />
      )
    }
    render(<Owner />)
    act(() =>
      fixture.requested?.({
        browserPageId: page.id,
        x: 1,
        y: 1,
        screenX: 1,
        screenY: 1,
        linkUrl: null,
        pageUrl: page.url,
        selectionText: '',
        canGoBack: false,
        canGoForward: false
      })
    )
    await act(async () => {
      await expect(
        requestBrowserContextMenu(page.id, 'reload', Date.now() + 5000)
      ).resolves.toMatchObject({ open: false, navigationRequested: true })
    })
    expect(update).toHaveBeenCalledExactlyOnceWith(page.id, { loading: true })
    expect(missingGuest ? recover : guestReload).toHaveBeenCalledOnce()
    expect(missingGuest ? guestReload : recover).not.toHaveBeenCalled()
  }
)
