// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { seedBrowserOverlayFocusOwner } from './browser-overlay-focus.test-fixture'
import { NativeToolbarFixture } from './browser-toolbar-external.test-fixture'
import { requestBrowserToolbarExternal } from '@/runtime/browser-toolbar-external-request'
const initial = useAppStore.getInitialState()
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
const language = i18n.language
let target: ReturnType<typeof seedBrowserOverlayFocusOwner>
const url = 'https://fixture.invalid/toolbar'
const opened: string[] = []
const verified = vi.fn(async (value: string) => {
  opened.push(value)
  return { opened: true as const }
})
const plain = vi.fn(async (value: string) => {
  opened.push(value)
})
const devtools = vi.fn(async () => true)
function Owner(props: { active?: boolean; externalUrl?: string } = {}) {
  return <NativeToolbarFixture target={target} {...props} />
}
function command() {
  return { ...target, page: 'page', url }
}
beforeEach(async () => {
  await i18n.changeLanguage('en')
  target = seedBrowserOverlayFocusOwner()
  useAppStore.getState().setBrowserPageUrl('page', url)
  opened.length = 0
  verified.mockClear()
  plain.mockClear()
  devtools.mockClear()
  verified.mockImplementation(async (value) => {
    opened.push(value)
    return { opened: true }
  })
  Reflect.set(window.api.shell, 'openVerifiedUrl', verified)
  Reflect.set(window.api.shell, 'openUrl', plain)
  Reflect.set(window.api.browser, 'openDevTools', devtools)
})
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
afterAll(async () => {
  await i18n.changeLanguage(language)
})
it('uses the actual native toolbar descriptors and verifies its exact external target through the same owner', async () => {
  render(<Owner />)
  fireEvent.click(screen.getByRole('button', { name: 'Open browser devtools' }))
  expect(devtools).toHaveBeenCalledExactlyOnceWith({ browserPageId: 'page' })
  fireEvent.click(screen.getByRole('button', { name: 'Open in default browser' }))
  expect(plain).toHaveBeenCalledExactlyOnceWith(url)
  await act(async () => {
    await expect(
      requestBrowserToolbarExternal(command(), Date.now() + 2000)
    ).resolves.toMatchObject({ requested: true, externalWindowVerified: false, url })
  })
  expect(verified).toHaveBeenCalledExactlyOnceWith(url)
  expect(opened).toEqual([url, url])
})
it('refuses wrong target, busy viewer, expired request and old shell before opening', async () => {
  render(<Owner />)
  await expect(
    requestBrowserToolbarExternal({ ...command(), workspaceId: 'other' }, Date.now() + 2000)
  ).rejects.toThrow('target')
  await expect(requestBrowserToolbarExternal(command(), Date.now() - 1)).rejects.toThrow('expired')
  useAppStore.setState({ activeModal: 'quick-open' })
  await expect(requestBrowserToolbarExternal(command(), Date.now() + 2000)).rejects.toThrow(
    'target'
  )
  useAppStore.setState({ activeModal: 'none' })
  Reflect.deleteProperty(window.api.shell, 'openVerifiedUrl')
  await expect(requestBrowserToolbarExternal(command(), Date.now() + 2000)).rejects.toThrow(
    'unavailable'
  )
  expect(verified).not.toHaveBeenCalled()
  expect(plain).not.toHaveBeenCalled()
})
it('rejects async failure and any held owner active ABA cycle or unmount without a late receipt', async () => {
  const view = render(<Owner />)
  verified.mockRejectedValueOnce(new Error('provider denied'))
  await expect(requestBrowserToolbarExternal(command(), Date.now() + 2000)).rejects.toThrow()
  let release: (() => void) | undefined
  verified.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ opened: true })
      })
  )
  const pending = requestBrowserToolbarExternal(command(), Date.now() + 2000)
  void pending.catch(() => {})
  view.rerender(<Owner active={false} />)
  view.rerender(<Owner />)
  release?.()
  await expect(pending).rejects.toThrow('changed')
  verified.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ opened: true })
      })
  )
  const disposed = requestBrowserToolbarExternal(command(), Date.now() + 2000)
  void disposed.catch(() => {})
  view.unmount()
  release?.()
  await expect(disposed).rejects.toThrow('changed')
})
it('accepts a resolved SSH-owned folder viewer and refuses paired or mismatched execution hosts', async () => {
  const view = render(<Owner />)
  await expect(
    requestBrowserToolbarExternal({ ...command(), executionHostId: 'ssh:other' }, Date.now() + 2000)
  ).rejects.toThrow('target')
  const state = useAppStore.getState()
  useAppStore.setState({
    activeWorkspaceExecutionHostId: 'ssh:fixture',
    folderWorkspaces: state.folderWorkspaces.map((folder) => ({
      ...folder,
      executionHostId: 'ssh:fixture' as const
    }))
  })
  await expect(
    requestBrowserToolbarExternal(
      { ...command(), executionHostId: 'ssh:fixture' },
      Date.now() + 2000
    )
  ).resolves.toMatchObject({ executionHostId: 'ssh:fixture' })
  expect(opened).toEqual([url])
  const settings = useAppStore.getState().settings
  if (!settings) {
    throw new Error('Fixture settings unavailable')
  }
  useAppStore.setState({
    settings: { ...settings, activeRuntimeEnvironmentId: 'paired' }
  })
  await expect(
    requestBrowserToolbarExternal(
      { ...command(), executionHostId: 'runtime:paired' },
      Date.now() + 2000
    )
  ).rejects.toThrow('target')
  view.rerender(<Owner externalUrl="https://other.invalid/" />)
  await expect(requestBrowserToolbarExternal(command(), Date.now() + 2000)).rejects.toThrow(
    'target'
  )
  expect(opened).toEqual([url])
})
it('refuses concurrent requests and late provider completion after the actual deadline', async () => {
  render(<Owner />)
  let release: (() => void) | undefined
  verified.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ opened: true })
      })
  )
  const expires = Date.now() + 2000
  const pending = requestBrowserToolbarExternal(command(), expires)
  void pending.catch(() => {})
  await expect(requestBrowserToolbarExternal(command(), expires)).rejects.toThrow('busy')
  const clock = vi.spyOn(Date, 'now').mockReturnValue(expires)
  try {
    release?.()
    await expect(pending).rejects.toThrow('expired')
  } finally {
    clock.mockRestore()
  }
  expect(verified).toHaveBeenCalledTimes(1)
})
