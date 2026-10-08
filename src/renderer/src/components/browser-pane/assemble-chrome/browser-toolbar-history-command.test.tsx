// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { requestBrowserToolbar } from '@/runtime/browser-toolbar-request'
import { useBrowserToolbarHistoryCommands } from './use-browser-toolbar-history-commands'
import type { BrowserNavigationControls } from './browser-navigation-control-row'
afterEach(cleanup)
it('dispatches exact-page back/forward to the owning toolbar callbacks, including conversion history', () => {
  let current = 'web'
  const controls: BrowserNavigationControls = {
    canGoBack: true,
    canGoForward: true,
    loading: false,
    goBack: () => {
      current = 'document'
    },
    goForward: () => {
      current = 'web'
    },
    reload: vi.fn(),
    navigate: vi.fn()
  }
  renderHook(() =>
    useBrowserToolbarHistoryCommands({
      page: 'p1',
      controls,
      nativeBack: false,
      nativeForward: false,
      guestAvailable: () => false
    })
  )
  expect(requestBrowserToolbar('p1', 'back', Date.now() + 9000)).toEqual({ action: 'back' })
  expect(current).toBe('document')
  requestBrowserToolbar('p1', 'forward', Date.now() + 9000)
  expect(current).toBe('web')
  expect(() => requestBrowserToolbar('other', 'back', Date.now() + 9000)).toThrow(
    'browser_toolbar_unavailable'
  )
})
it('refuses missing native guests, unavailable history and expired actions', () => {
  const controls: BrowserNavigationControls = {
    canGoBack: true,
    canGoForward: false,
    loading: false,
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    navigate: vi.fn()
  }
  renderHook(() =>
    useBrowserToolbarHistoryCommands({
      page: 'p1',
      controls,
      nativeBack: true,
      nativeForward: false,
      guestAvailable: () => false
    })
  )
  expect(() => requestBrowserToolbar('p1', 'back', Date.now() + 9000)).toThrow(
    'browser_guest_unavailable'
  )
  expect(() => requestBrowserToolbar('p1', 'forward', Date.now() + 9000)).toThrow(
    'browser_history_unavailable'
  )
  expect(() => requestBrowserToolbar('p1', 'back', Date.now() - 1)).toThrow('request_expired')
  expect(controls.goBack).not.toHaveBeenCalled()
})

it('does not use conversion fallback for shortcut-only actions', () => {
  const conversion = vi.fn()
  renderHook(() =>
    useBrowserToolbarHistoryCommands({
      page: 'p1',
      controls: {
        canGoBack: true,
        canGoForward: true,
        loading: false,
        goBack: conversion,
        goForward: conversion,
        reload: vi.fn(),
        navigate: vi.fn()
      },
      nativeBack: false,
      nativeForward: false,
      guestAvailable: () => false
    })
  )
  expect(() => requestBrowserToolbar('p1', 'back-shortcut', Date.now() + 9000)).toThrow(
    'browser_guest_unavailable'
  )
  expect(conversion).not.toHaveBeenCalled()
})
