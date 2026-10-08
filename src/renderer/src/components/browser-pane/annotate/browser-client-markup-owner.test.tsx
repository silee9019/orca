// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { applyBrowserViewerRequest } from '@/runtime/browser-viewer-bridge'
import { getDefaultSettings } from '../../../../../shared/constants'
import type { BrowserViewerResult } from '../../../../../shared/browser-viewer-command'
import { installClientHostedPaneApi } from '../client-hosted-browser-pane-test-rig'
import { useClientHostedBrowserMarkup } from './use-client-hosted-browser-markup'
const fixture = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('./markup-base-image', () => ({ captureMarkupBaseImage: fixture.capture }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const initial = useAppStore.getInitialState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
const target = {
  worktreeId: 'folder:fixture',
  page: 'page',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
const placement = {
  kind: 'client',
  browserHostClientId: target.browserHostClientId,
  browserHostGeneration: target.browserHostGeneration,
  pageHostGeneration: target.pageHostGeneration
} as const
beforeEach(() => {
  fixture.capture.mockReset().mockResolvedValue({ dataUrl: 'fixture', width: 100, height: 80 })
  installClientHostedPaneApi()
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    persistedUIReady: true,
    activeModal: 'none',
    activeWorktreeId: target.worktreeId
  })
  useAppStore
    .getState()
    .createBrowserTab(target.worktreeId, 'https://example.test', { browserPageId: target.page })
  useAppStore.setState((state) => ({
    browserPagesByWorkspace: Object.fromEntries(
      Object.entries(state.browserPagesByWorkspace).map(([workspace, pages]) => [
        workspace,
        pages.map((page) => ({ ...page, browserRuntimeEnvironmentId: target.environmentId }))
      ])
    )
  }))
  useAppStore.setState({
    settings: {
      ...getDefaultSettings('/fixture'),
      activeRuntimeEnvironmentId: target.environmentId
    },
    remoteBrowserPageHandlesByPageId: {
      [target.page]: {
        environmentId: target.environmentId,
        remotePageId: target.remotePageId,
        placement
      }
    }
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
function mount(active = true) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The test guest supplies the geometry and style read by the existing markup capture owner; no Electron methods are invoked.
  const guest = document.createElement('webview') as Electron.WebviewTag
  guest.getBoundingClientRect = () => new DOMRect(0, 0, 100, 80)
  const owner = renderHook(() =>
    useClientHostedBrowserMarkup({
      webviewRef: { current: guest },
      browserPageId: target.page,
      runtimeEnvironmentId: target.environmentId,
      placement,
      isActive: active,
      unavailable: false,
      showFailureOverlay: false
    })
  )
  return { guest, owner }
}
async function command(action: 'start' | 'cancel' | 'status', exactTarget = target) {
  let pending: Promise<BrowserViewerResult> | undefined
  await act(async () => {
    pending = applyBrowserViewerRequest({
      id: 'fixture',
      expiresAt: Date.now() + 5000,
      command: { viewer: 'host', operation: 'client-markup', target: exactTarget, action }
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing request')
  }
  return pending
}
it('uses the mounted client hook capture and restores its guest after cancellation', async () => {
  const { guest, owner } = mount()
  const result = await command('start')
  expect(result.clientMarkup).toEqual({
    ...target,
    action: 'start',
    state: 'drawing',
    hasImage: true,
    accepted: true
  })
  expect(fixture.capture).toHaveBeenCalledWith({ kind: 'webview', webview: guest })
  expect(owner.result.current.overlay).not.toBeNull()
  expect(guest.style.display).toBe('none')
  expect((await command('cancel')).clientMarkup).toMatchObject({ state: 'idle', hasImage: false })
  expect(owner.result.current.overlay).toBeNull()
  expect(guest.style.display).toBe('flex')
})
it('refuses inactive, duplicate, mismatched and staged client owners before capture', async () => {
  const inactive = mount(false)
  await expect(command('start')).rejects.toThrow('browser_markup_viewer_inactive')
  inactive.owner.unmount()
  mount()
  await expect(command('start', { ...target, pageHostGeneration: 5 })).rejects.toThrow(
    'browser_client_markup_target_mismatch'
  )
  const duplicate = mount()
  await expect(command('start')).rejects.toThrow('browser_markup_owner_ambiguous')
  duplicate.owner.unmount()
  await act(async () =>
    useAppStore.setState({
      remoteBrowserPageHandlesByPageId: {
        [target.page]: {
          environmentId: target.environmentId,
          remotePageId: target.remotePageId,
          placement,
          staged: true
        }
      }
    })
  )
  await expect(command('start')).rejects.toThrow('browser_client_markup_target_mismatch')
  expect(fixture.capture).not.toHaveBeenCalled()
})
it('discards capture when the materialized page generation changes', async () => {
  let resolveCapture: (value: { dataUrl: string; width: number; height: number }) => void = () => {
    throw new Error('capture missing')
  }
  fixture.capture.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveCapture = resolve
      })
  )
  const { owner, guest } = mount()
  let pending: Promise<BrowserViewerResult> | undefined
  await act(async () => {
    pending = applyBrowserViewerRequest({
      id: 'pending',
      expiresAt: Date.now() + 5000,
      command: { viewer: 'host', operation: 'client-markup', target, action: 'start' }
    })
    void pending.catch(() => {})
  })
  await act(async () =>
    useAppStore.setState({
      remoteBrowserPageHandlesByPageId: {
        [target.page]: {
          environmentId: target.environmentId,
          remotePageId: target.remotePageId,
          placement: { ...placement, pageHostGeneration: 5 }
        }
      }
    })
  )
  await act(async () => resolveCapture({ dataUrl: 'stale', width: 100, height: 80 }))
  await expect(pending).rejects.toThrow('browser_markup_owner_changed_effect_unknown')
  expect(owner.result.current.overlay).toBeNull()
  expect(guest.style.display).toBe('flex')
})
