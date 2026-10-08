// @vitest-environment happy-dom
import { useAppStore } from '@/store'
import {
  hydrateBrowserDrivers,
  setDriverForBrowserPage
} from '@/lib/pane-manager/browser-mobile-driver-state'
import { requestBrowserTakeBack } from '@/runtime/browser-take-back-request'
import {
  BrowserTakeBackFixture,
  seedBrowserTakeBackOwner
} from './browser-take-back-owner.test-fixture'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BrowserMobileDriverOverlay } from './BrowserMobileDriverOverlay'
const initial = useAppStore.getInitialState()
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  hydrateBrowserDrivers([])
  useAppStore.setState(initial, true)
  vi.useRealTimers()
  cleanup()
  vi.restoreAllMocks()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('blocks a second take-back through the actual UI owner before React commits pending state', async () => {
  let finish = () => {}
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const onTakeBack = vi.fn(() => gate)
  render(
    <BrowserMobileDriverOverlay
      driver={{ kind: 'mobile', clientId: 'fixture-phone' }}
      onTakeBack={onTakeBack}
    />
  )
  const button = screen.getByRole('button', { name: 'Take back' })
  act(() => {
    fireEvent.click(button)
    fireEvent.click(button)
  })
  expect(onTakeBack).toHaveBeenCalledTimes(1)
  await act(async () => {
    finish()
    await gate
  })
})

const target = {
  page: 'page',
  worktreeId: 'folder:fixture',
  expectedMobileClientId: 'fixture-phone'
}
it('acknowledges only actual desktop read-back and blocks CLI/UI duplicates while the provider is pending', async () => {
  seedBrowserTakeBackOwner()
  let finish = () => {}
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const onTakeBack = vi.fn(async () => {
    await gate
    setDriverForBrowserPage('page', { kind: 'desktop' })
  })
  render(<BrowserTakeBackFixture onTakeBack={onTakeBack} />)
  const pending = requestBrowserTakeBack(target, Date.now() + 9000)
  await expect(requestBrowserTakeBack(target, Date.now() + 9000)).rejects.toThrow('busy')
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Take back' })))
  expect(onTakeBack).toHaveBeenCalledTimes(1)
  await act(async () => {
    finish()
    await expect(pending).resolves.toMatchObject({ driver: 'desktop', reclaimed: true })
  })
  expect(screen.queryByRole('button', { name: 'Take back' })).toBeNull()
})
it('shows provider rejection and allows retry without a false desktop receipt', async () => {
  seedBrowserTakeBackOwner()
  const onTakeBack = vi.fn(async () => {
    throw new Error('provider_refused')
  })
  const view = render(<BrowserTakeBackFixture onTakeBack={onTakeBack} />)
  await act(async () => {
    await expect(requestBrowserTakeBack(target, Date.now() + 9000)).rejects.toThrow(
      'provider_refused'
    )
  })
  expect(screen.getByRole('alert').textContent).toContain("Couldn't take back")
  const retry = vi.fn(async () => {
    setDriverForBrowserPage('page', { kind: 'desktop' })
  })
  view.rerender(<BrowserTakeBackFixture onTakeBack={retry} />)
  await act(async () => {
    await expect(requestBrowserTakeBack(target, Date.now() + 9000)).resolves.toMatchObject({
      reclaimed: true
    })
  })
})
it('refuses wrong driver, workspace, busy modal and paired handle before provider invocation', async () => {
  seedBrowserTakeBackOwner()
  const onTakeBack = vi.fn(async () => {})
  render(<BrowserTakeBackFixture onTakeBack={onTakeBack} />)
  await expect(
    requestBrowserTakeBack({ ...target, expectedMobileClientId: 'other' }, Date.now() + 9000)
  ).rejects.toThrow('driver_changed')
  await expect(
    requestBrowserTakeBack({ ...target, worktreeId: 'wrong' }, Date.now() + 9000)
  ).rejects.toThrow('target_changed')
  act(() => useAppStore.setState({ activeModal: 'add-repo' }))
  await expect(requestBrowserTakeBack(target, Date.now() + 9000)).rejects.toThrow('target_changed')
  act(() => {
    useAppStore.setState({ activeModal: 'none' })
    useAppStore
      .getState()
      .setRemoteBrowserPageHandle('page', { environmentId: 'paired', remotePageId: 'remote' })
  })
  await expect(requestBrowserTakeBack(target, Date.now() + 9000)).rejects.toThrow('target_changed')
  expect(onTakeBack).not.toHaveBeenCalled()
})
it('waits for delayed driver push after provider acceptance and refuses a new mobile owner', async () => {
  seedBrowserTakeBackOwner()
  const onTakeBack = vi.fn(async () => {})
  render(<BrowserTakeBackFixture onTakeBack={onTakeBack} />)
  const pending = requestBrowserTakeBack(target, Date.now() + 9000)
  const rejected = expect(pending).rejects.toThrow('driver_changed_effect_unknown')
  await Promise.resolve()
  await Promise.resolve()
  act(() => setDriverForBrowserPage('page', { kind: 'mobile', clientId: 'new-phone' }))
  await rejected
  expect(onTakeBack).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Take back' })).not.toBeNull()
})
it('rejects expiry with no driver push and rejects unmount during a pending provider', async () => {
  seedBrowserTakeBackOwner()
  vi.useFakeTimers()
  const view = render(<BrowserTakeBackFixture onTakeBack={async () => {}} />)
  const pending = requestBrowserTakeBack(target, Date.now() + 20)
  const rejected = expect(pending).rejects.toThrow('expired_effect_unknown')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20)
    await rejected
  })
  view.unmount()
  vi.useRealTimers()
  let finish = () => {}
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const mounted = render(<BrowserTakeBackFixture onTakeBack={() => gate} />)
  const next = requestBrowserTakeBack(target, Date.now() + 9000)
  const disposed = expect(next).rejects.toThrow('disposed_effect_unknown')
  mounted.unmount()
  await disposed
  await act(async () => {
    finish()
    await gate
    await Promise.resolve()
  })
})

it('rejects a workspace replacement while the accepted provider is still pending and never acknowledges its late reply', async () => {
  seedBrowserTakeBackOwner()
  let finish = () => {}
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const provider = vi.fn(() => gate)
  render(<BrowserTakeBackFixture onTakeBack={provider} />)
  const pending = requestBrowserTakeBack(target, Date.now() + 9000)
  const rejected = expect(pending).rejects.toThrow('target_changed_effect_unknown')
  await act(async () => {
    useAppStore.setState({ activeWorktreeId: 'folder:other' })
    await rejected
  })
  expect(provider).toHaveBeenCalledTimes(1)
  await act(async () => {
    finish()
    await gate
    await Promise.resolve()
  })
  expect(screen.queryByRole('alert')).toBeNull()
})
