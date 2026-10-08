// @vitest-environment happy-dom
import type { BrowserBannerCommand } from '../../../../../shared/rpc-contract/browser-banner-params'
import { makeAnnotation } from '@/store/slices/browser-annotation-test-fixture'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { BrowserBannerEvent, requestBrowserBanner } from '@/runtime/browser-banner-request'
import { seedBrowserOverlayFocusOwner } from './browser-overlay-focus.test-fixture'
import { BrowserBannerFixture } from './browser-banner.test-fixture'
vi.mock('../annotate/BrowserAnnotationSendMenuContent', () => ({
  BrowserAnnotationSendMenuContent: () => null
}))
const initial = useAppStore.getInitialState()
const previous = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  vi.useRealTimers()
  if (previous) {
    Object.defineProperty(window, 'api', previous)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
function setup() {
  seedBrowserOverlayFocusOwner()
  Reflect.set(
    window.api.browser,
    'onPermissionDenied',
    vi.fn(() => () => {})
  )
  Reflect.set(
    window.api.browser,
    'onPopup',
    vi.fn(() => () => {})
  )
  Reflect.set(
    window.api.browser,
    'setGrabMode',
    vi.fn(async () => ({ ok: true }))
  )
  Reflect.set(
    window.api.browser,
    'cancelGrab',
    vi.fn(async () => true)
  )
  Reflect.set(
    window.api.browser,
    'awaitGrabSelection',
    vi.fn(() => new Promise<never>(() => {}))
  )
  return render(<BrowserBannerFixture />)
}
it('dismisses the actual resource notice after its React state commits', async () => {
  setup()
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Seed notice' })))
  expect(screen.getByText('FIXTURE_PRIVATE')).not.toBeNull()
  let pending: ReturnType<typeof requestBrowserBanner> | undefined
  await act(async () => {
    pending = requestBrowserBanner(
      { page: 'page', worktreeId: 'folder:fixture', action: 'resource-dismiss' },
      Date.now() + 5000
    )
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing command')
  }
  await expect(pending).resolves.toMatchObject({ hasResourceNotice: false })
  expect(screen.queryByText('FIXTURE_PRIVATE')).toBeNull()
})
async function begin(action: BrowserBannerCommand['action']) {
  let pending: ReturnType<typeof requestBrowserBanner> | undefined
  await act(async () => {
    pending = requestBrowserBanner(
      { page: 'page', worktreeId: 'folder:fixture', action },
      Date.now() + 5000
    )
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing command')
  }
  return { pending }
}
async function start() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Start annotation grab' }))
  })
}
it('cancels the existing grab provider and clears an actual captured pending annotation', async () => {
  setup()
  Reflect.set(
    window.api.browser,
    'awaitGrabSelection',
    vi.fn(async ({ opId }: { opId: string }) => ({
      opId,
      kind: 'selected',
      payload: makeAnnotation('page').payload
    }))
  )
  Reflect.set(
    window.api.browser,
    'captureSelectionScreenshot',
    vi.fn(async () => ({ ok: false }))
  )
  await start()
  expect(await (await begin('status')).pending).toMatchObject({
    hasPendingAnnotation: true,
    grabState: 'confirming'
  })
  expect(await (await begin('cancel-grab')).pending).toMatchObject({
    hasPendingAnnotation: false,
    grabState: 'idle',
    cancellationAccepted: true
  })
  expect(window.api.browser.setGrabMode).toHaveBeenLastCalledWith({
    browserPageId: 'page',
    enabled: false
  })
})
it('uses the real banner send mode owner and closes the same mode without delivering a prompt', async () => {
  setup()
  await start()
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Seed annotation' })))
  expect(await (await begin('send-menu-open')).pending).toMatchObject({ sendMenuOpen: true })
  expect(useAppStore.getState().agentSendPopoverTargetMode?.id).toBe(
    'browser-annotations:page:banner'
  )
  expect(await (await begin('send-menu-close')).pending).toMatchObject({ sendMenuOpen: false })
  expect(useAppStore.getState().browserAnnotationsByPageId.page).toHaveLength(1)
})
it('rejects a refused provider cancellation even though its UI has returned idle', async () => {
  setup()
  await start()
  Reflect.set(
    window.api.browser,
    'cancelGrab',
    vi.fn(async () => false)
  )
  await expect((await begin('cancel-grab')).pending).rejects.toThrow(
    'cancel_refused_effect_unknown'
  )
})
it('blocks duplicates before provider completion and rejects on unmount', async () => {
  const view = setup()
  await start()
  let finish = () => {}
  const gate = new Promise<boolean>((resolve) => {
    finish = () => resolve(true)
  })
  const cancel = vi.fn(() => gate)
  Reflect.set(window.api.browser, 'cancelGrab', cancel)
  const { pending } = await begin('cancel-grab')
  await expect((await begin('cancel-grab')).pending).rejects.toThrow('busy')
  expect(cancel).toHaveBeenCalledTimes(1)
  view.unmount()
  await expect(pending).rejects.toThrow('disposed')
  finish()
  await gate
})
it('expires an in-flight cancellation without accepting a later provider result', async () => {
  setup()
  await start()
  vi.useFakeTimers()
  let finish = () => {}
  const gate = new Promise<boolean>((resolve) => {
    finish = () => resolve(true)
  })
  Reflect.set(
    window.api.browser,
    'cancelGrab',
    vi.fn(() => gate)
  )
  const { pending } = await begin('cancel-grab')
  await act(async () => {
    vi.advanceTimersByTime(5000)
  })
  await expect(pending).rejects.toThrow('expired')
  finish()
  await gate
})
it('rejects owner replacement and modal/remote targets before further effects', async () => {
  const view = setup()
  await start()
  useAppStore.setState({ activeModal: 'create-worktree' })
  await expect((await begin('cancel-grab')).pending).rejects.toThrow('target_changed')
  useAppStore.setState({ activeModal: 'none' })
  let finish = () => {}
  const gate = new Promise<boolean>((resolve) => {
    finish = () => resolve(true)
  })
  Reflect.set(
    window.api.browser,
    'cancelGrab',
    vi.fn(() => gate)
  )
  const { pending } = await begin('cancel-grab')
  view.rerender(<BrowserBannerFixture page="other" />)
  await expect(pending).rejects.toThrow('target_changed')
  finish()
  await gate
})
it('does not dismiss a replacement notice through a previously offered callback', async () => {
  setup()
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Seed notice' })))
  const event = new BrowserBannerEvent(
    { page: 'page', worktreeId: 'folder:fixture', action: 'resource-dismiss' },
    Date.now() + 5000
  )
  window.dispatchEvent(event)
  expect(event.offers).toHaveLength(1)
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Replace notice' })))
  await expect(event.offers[0]()).rejects.toThrow('owner_changed')
  expect(screen.getByText('FIXTURE_REPLACEMENT')).not.toBeNull()
})
it('refuses a paired execution page before invoking its native picker callback', async () => {
  setup()
  await start()
  const state = useAppStore.getState()
  act(() =>
    useAppStore.setState({
      browserPagesByWorkspace: Object.fromEntries(
        Object.entries(state.browserPagesByWorkspace).map(([workspace, pages]) => [
          workspace,
          pages.map((page) => ({ ...page, browserRuntimeEnvironmentId: 'peer-fixture' }))
        ])
      )
    })
  )
  const before = vi.mocked(window.api.browser.setGrabMode).mock.calls.length
  await expect((await begin('cancel-grab')).pending).rejects.toThrow('target_changed')
  expect(window.api.browser.setGrabMode).toHaveBeenCalledTimes(before)
})
it('never acknowledges a held cancellation after a same-act workspace A-B-A cycle', async () => {
  setup()
  await start()
  let finish = () => {}
  const gate = new Promise<boolean>((resolve) => {
    finish = () => resolve(true)
  })
  Reflect.set(
    window.api.browser,
    'cancelGrab',
    vi.fn(() => gate)
  )
  const { pending } = await begin('cancel-grab')
  act(() => {
    useAppStore.setState({ activeWorktreeId: 'folder:other' })
    useAppStore.setState({ activeWorktreeId: 'folder:fixture' })
  })
  await act(async () => {
    finish()
    await gate
  })
  await expect(pending).rejects.toThrow('target_changed')
})
it.each(['page', 'remote-handle'] as const)(
  'rejects held cancellation on transient %s replacement',
  async (kind) => {
    setup()
    await start()
    let finish = () => {}
    const gate = new Promise<boolean>((resolve) => {
      finish = () => resolve(true)
    })
    Reflect.set(
      window.api.browser,
      'cancelGrab',
      vi.fn(() => gate)
    )
    const { pending } = await begin('cancel-grab')
    const before = useAppStore.getState()
    act(() => {
      if (kind === 'page') {
        useAppStore.setState({
          browserPagesByWorkspace: Object.fromEntries(
            Object.entries(before.browserPagesByWorkspace).map(([key, pages]) => [
              key,
              pages.map((page) => ({ ...page, url: 'https://changed.invalid' }))
            ])
          )
        })
        useAppStore.setState({ browserPagesByWorkspace: before.browserPagesByWorkspace })
      } else {
        useAppStore.setState({
          remoteBrowserPageHandlesByPageId: {
            page: { environmentId: 'other', remotePageId: 'other' }
          }
        })
        useAppStore.setState({
          remoteBrowserPageHandlesByPageId: before.remoteBrowserPageHandlesByPageId
        })
      }
    })
    await expect(pending).rejects.toThrow('target_changed')
    await act(async () => {
      finish()
      await gate
    })
    await expect(pending).rejects.toThrow('target_changed')
  }
)
it('rejects a held provider on the actual owner active-to-inactive-to-active commits', async () => {
  const view = setup()
  await start()
  let finish = () => {}
  const gate = new Promise<boolean>((resolve) => {
    finish = () => resolve(true)
  })
  Reflect.set(
    window.api.browser,
    'cancelGrab',
    vi.fn(() => gate)
  )
  const { pending } = await begin('cancel-grab')
  view.rerender(<BrowserBannerFixture active={false} />)
  view.rerender(<BrowserBannerFixture active />)
  await expect(pending).rejects.toThrow('target_changed')
  await act(async () => {
    finish()
    await gate
  })
})
