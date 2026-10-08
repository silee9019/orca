// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { BrowserToolbarAction } from '../../../../../shared/rpc-contract/browser-toolbar-navigation-params'
import { useAppStore } from '@/store'
import { requestBrowserToolbar } from '@/runtime/browser-toolbar-request'
import { seedBrowserOverlayFocusOwner } from './browser-overlay-focus.test-fixture'
import { useBrowserToolbarHistoryCommands } from './use-browser-toolbar-history-commands'
const initial = useAppStore.getInitialState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
let target: ReturnType<typeof seedBrowserOverlayFocusOwner>
let index = 1
let loading = true
const urls = ['https://first.test/', 'https://second.test/']
const back = vi.fn(() => {
  index--
})
const forward = vi.fn(() => {
  index++
})
const conversion = vi.fn()
const guest: Pick<
  Electron.WebviewTag,
  'getURL' | 'getTitle' | 'isLoading' | 'canGoBack' | 'canGoForward' | 'goBack' | 'goForward'
> = {
  getURL: () => urls[index],
  getTitle: () => 'History',
  isLoading: () => loading,
  canGoBack: () => index > 0,
  canGoForward: () => index < 1,
  goBack: back,
  goForward: forward
}
function mount(active = true) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This fixture implements the metadata/history guest methods read by this owner; no native guest is created.
  const ref = { current: guest as Electron.WebviewTag }
  return renderHook(
    ({ isActive }) =>
      useBrowserToolbarHistoryCommands({
        page: 'page',
        controls: {
          canGoBack: true,
          canGoForward: true,
          loading,
          goBack: conversion,
          goForward: conversion,
          reload: vi.fn(),
          navigate: vi.fn()
        },
        nativeBack: false,
        nativeForward: false,
        guestAvailable: () => true,
        shortcutOwner: { ...target, isActive, webviewRef: ref }
      }),
    { initialProps: { isActive: active } }
  )
}
const request = (
  action: 'back-shortcut' | 'forward-shortcut' = 'back-shortcut',
  expiresAt = Date.now() + 2000
) => requestBrowserToolbar('page', action, expiresAt)
beforeEach(() => {
  target = seedBrowserOverlayFocusOwner()
  useAppStore.setState({ activeModal: 'none', activeView: 'terminal' })
  index = 1
  loading = true
  back.mockReset().mockImplementation(() => {
    index--
  })
  forward.mockReset().mockImplementation(() => {
    index++
  })
  conversion.mockClear()
})
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  if (api) {
    Object.defineProperty(window, 'api', api)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('uses mounted native owner guest history while loading without conversion callbacks', () => {
  mount()
  expect(request()).toEqual({ action: 'back-shortcut' })
  expect(guest.getURL()).toBe(urls[0])
  expect(request('forward-shortcut')).toEqual({ action: 'forward-shortcut' })
  expect(guest.getURL()).toBe(urls[1])
  expect(back).toHaveBeenCalledTimes(1)
  expect(forward).toHaveBeenCalledTimes(1)
  expect(conversion).not.toHaveBeenCalled()
})
it('refuses exhausted guest history even when conversion controls are available', () => {
  mount()
  index = 0
  expect(() => request()).toThrow('browser_history_unavailable')
  expect(back).not.toHaveBeenCalled()
  expect(conversion).not.toHaveBeenCalled()
  requestBrowserToolbar('page', 'back', Date.now() + 2000)
  expect(conversion).toHaveBeenCalledTimes(1)
})
it('fences active target, paired placement, expiration, replacement and unmount', () => {
  const view = mount()
  useAppStore.setState({ activeWorktreeId: 'other' })
  expect(() => request()).toThrow('owner_changed')
  useAppStore.setState({ activeWorktreeId: target.worktreeId })
  useAppStore.setState((state) => ({
    settings: state.settings && { ...state.settings, activeRuntimeEnvironmentId: 'paired' }
  }))
  expect(() => request()).toThrow('owner_changed')
  useAppStore.setState((state) => ({
    settings: state.settings && { ...state.settings, activeRuntimeEnvironmentId: null }
  }))
  expect(() => request('back-shortcut', Date.now() - 1)).toThrow('request_expired')
  view.rerender({ isActive: false })
  expect(() => request()).toThrow('owner_changed')
  view.unmount()
  expect(() => request()).toThrow('toolbar_unavailable')
  expect(back).not.toHaveBeenCalled()
})
it('latches store ABA, rejects reentrant calls and checks a late synchronous receipt', () => {
  mount()
  back.mockImplementation(() => {
    useAppStore.setState({ activeWorktreeId: 'other' })
    useAppStore.setState({ activeWorktreeId: target.worktreeId })
    index = 0
  })
  expect(() => request()).toThrow('owner_changed')
  index = 1
  back.mockImplementation(() => {
    expect(() => request()).toThrow('history_busy')
    index = 0
    vi.spyOn(Date, 'now').mockReturnValue(3000)
  })
  vi.spyOn(Date, 'now').mockReturnValue(1000)
  expect(() => request('back-shortcut', 2000)).toThrow('request_expired')
  expect(conversion).not.toHaveBeenCalled()
})
it('old toolbar action enum rejects shortcut actions rather than falling back', () => {
  const oldActions = z.enum(['back', 'forward', 'reload-button', 'reload', 'hard-reload'])
  expect(BrowserToolbarAction.parse('back-shortcut')).toBe('back-shortcut')
  expect(BrowserToolbarAction.parse('forward-shortcut')).toBe('forward-shortcut')
  expect(oldActions.safeParse('back-shortcut').success).toBe(false)
  expect(oldActions.safeParse('forward-shortcut').success).toBe(false)
})
