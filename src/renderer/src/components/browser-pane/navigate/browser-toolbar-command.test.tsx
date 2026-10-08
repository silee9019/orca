// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { requestBrowserToolbar } from '@/runtime/browser-toolbar-request'
import type { BrowserPage } from '../../../../../shared/browser-workspace-types'
import { BROWSER_GUEST_RECOVERY_ERROR_CODE } from '../host-guest/browser-page-guest-recovery'
import { useBrowserPageReloadActions } from './use-browser-page-reload-actions'
vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutLabel: () => '' }))
afterEach(cleanup)
const page: BrowserPage = {
  id: 'page-a',
  workspaceId: 'workspace-a',
  worktreeId: 'worktree-a',
  createdAt: 1,
  url: 'https://example.test',
  title: 'Fixture',
  loading: false,
  loadError: null,
  faviconUrl: null,
  canGoBack: false,
  canGoForward: false
}
function setup(overrides: Partial<BrowserPage> = {}, missingGuest = false, notReady = false) {
  const reload = vi.fn(() => {
    if (notReady) {
      throw new Error('not ready')
    }
  })
  const hard = vi.fn()
  const stop = vi.fn()
  const retry = vi.fn()
  const guest = Object.assign(document.createElement('webview'), {
    src: '',
    getWebContentsId: () => {
      if (missingGuest) {
        throw new Error('guest missing')
      }
      return 42
    },
    reload,
    reloadIgnoringCache: hard,
    stop
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The reload owner uses only the DOM and guest methods supplied by this fixture.
  const ref = { current: guest as unknown as Electron.WebviewTag }
  renderHook(() =>
    useBrowserPageReloadActions({
      browserTab: { ...page, ...overrides },
      webviewRef: ref,
      retryGuestRecoveryRef: { current: retry },
      onUpdatePageStateRef: { current: vi.fn() }
    })
  )
  return { reload, hard, stop, retry, guest }
}
it('uses the existing reload owner for stop, hard reload, and destroyed guest recovery', () => {
  const loading = setup({ loading: true })
  act(() => {
    expect(requestBrowserToolbar('page-a', 'reload-button', Date.now() + 9000)).toEqual({
      action: 'reload-button',
      intent: 'stop'
    })
  })
  expect(loading.stop).toHaveBeenCalledOnce()
  expect(loading.reload).not.toHaveBeenCalled()
  cleanup()
  const normal = setup()
  act(() => {
    requestBrowserToolbar('page-a', 'hard-reload', Date.now() + 9000)
  })
  expect(normal.hard).toHaveBeenCalledOnce()
  cleanup()
  const destroyed = setup({}, true)
  act(() => {
    requestBrowserToolbar('page-a', 'reload', Date.now() + 9000)
  })
  expect(destroyed.retry).toHaveBeenCalledOnce()
  expect(destroyed.reload).not.toHaveBeenCalled()
})
it('retries a failed guest through the existing recovery owner and rejects expired/wrong page', () => {
  const failed = setup({
    loadError: {
      code: BROWSER_GUEST_RECOVERY_ERROR_CODE,
      description: 'fixture',
      validatedUrl: page.url
    }
  })
  act(() => {
    expect(requestBrowserToolbar('page-a', 'reload', Date.now() + 9000).intent).toBe(
      'retry-guest-recovery'
    )
  })
  expect(failed.retry).toHaveBeenCalledOnce()
  expect(() => requestBrowserToolbar('wrong', 'reload', Date.now() + 9000)).toThrow(
    'browser_toolbar_unavailable'
  )
  expect(() => requestBrowserToolbar('page-a', 'reload', Date.now() - 1)).toThrow('request_expired')
})

it('navigates to the validated failed URL rather than reloading the error page', () => {
  const failed = setup({
    loadError: {
      code: -105,
      description: 'failed',
      validatedUrl: 'https://retry.example.test/path'
    }
  })
  act(() => {
    expect(requestBrowserToolbar('page-a', 'reload', Date.now() + 9000).intent).toBe('retry-load')
  })
  expect(failed.guest.src).toBe('https://retry.example.test/path')
  expect(failed.reload).not.toHaveBeenCalled()
})

it('does not acknowledge a live guest that rejects reload or an invalid retry URL', () => {
  setup({}, false, true)
  expect(() => requestBrowserToolbar('page-a', 'reload', Date.now() + 9000)).toThrow(
    'browser_guest_not_ready'
  )
  cleanup()
  setup({
    url: 'javascript:void(0)',
    loadError: { code: -105, description: 'failed', validatedUrl: 'javascript:void(0)' }
  })
  expect(() => requestBrowserToolbar('page-a', 'reload', Date.now() + 9000)).toThrow(
    'browser_guest_not_ready'
  )
})

it.each(['back-shortcut', 'forward-shortcut'] as const)(
  'leaves %s to the native history owner without claiming or reloading',
  (action) => {
    const owner = setup()
    expect(() => requestBrowserToolbar('page-a', action, Date.now() + 9000)).toThrow(
      'browser_toolbar_unavailable'
    )
    expect(owner.reload).not.toHaveBeenCalled()
    expect(owner.hard).not.toHaveBeenCalled()
    expect(owner.stop).not.toHaveBeenCalled()
    expect(owner.retry).not.toHaveBeenCalled()
  }
)
