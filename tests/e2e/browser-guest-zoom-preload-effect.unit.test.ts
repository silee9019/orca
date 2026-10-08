// @vitest-environment happy-dom
import { EventEmitter } from 'node:events'
import { act, cleanup, render } from '@testing-library/react'
import { createElement, Fragment, useRef, useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { setupGuestShortcutForwarding } from '../../src/main/browser/browser-guest-shortcut-forwarding'
import { uiTabAndBrowserCommandsApi } from '../../src/preload/api/ui-bridge-tab-and-browser-commands'
import { useBrowserPageWebviewShortcuts } from '../../src/renderer/src/components/browser-pane/host-guest/use-browser-page-webview-shortcuts'
import {
  forgetExplicitBrowserPageZoomLevel,
  getExplicitBrowserPageZoomLevel
} from '../../src/renderer/src/components/browser-pane/host-guest/browser-page-zoom'

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return { ipcRenderer: new EventEmitter(), screen: {}, webContents: {} }
})
vi.mock('../../src/preload/preload-runtime-support', () => ({
  browserFindSubscriptions: { subscribe: () => () => {} }
}))
import { ipcRenderer } from 'electron'

const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
const originalStore = useAppStore.getState()
const releases: (() => void)[] = []
afterEach(() => {
  cleanup()
  for (const release of releases.splice(0)) {
    release()
  }
  for (const id of ['zoom-owner-a', 'zoom-owner-b']) {
    forgetExplicitBrowserPageZoomLevel(id)
  }
  useAppStore.setState(originalStore, true)
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})

function Pane({ id, guest }: { id: string; guest: Electron.WebviewTag }) {
  const webviewRef = useRef(guest)
  const isActiveRef = useRef(true)
  const paneZoomLevelRef = useRef(0)
  const [defaultLevel, setDefaultLevel] = useState(0)
  const [feedback, showFeedback] = useState(0)
  useBrowserPageWebviewShortcuts({
    browserTabId: id,
    workspaceId: `workspace-${id}`,
    isActive: true,
    chromeShortcutScope: 'inactive',
    isActiveRef,
    webviewRef,
    paneZoomLevelRef,
    setBrowserDefaultZoomLevel: setDefaultLevel,
    showBrowserZoomFeedback: showFeedback,
    reloadWebviewOrRecoverGuest: () => {}
  })
  return createElement('output', { 'data-page': id }, `${defaultLevel}:${feedback}`)
}

it('delivers guest zoom through the actual preload subscription to the exact mounted pane and removes both lifetimes', () => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: uiTabAndBrowserCommandsApi }
  })
  const a = document.createElement('webview')
  const b = document.createElement('webview')
  let aLevel = 0
  let bLevel = 0
  const aWrites = vi.fn((value: number) => {
    aLevel = value
  })
  const bWrites = vi.fn((value: number) => {
    bLevel = value
  })
  Object.assign(a, { getZoomLevel: () => aLevel, setZoomLevel: aWrites })
  Object.assign(b, { getZoomLevel: () => bLevel, setZoomLevel: bWrites })
  const guest = new EventEmitter()
  const send = vi.fn((channel: string, payload: unknown) => {
    ipcRenderer.emit(channel, {}, payload)
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: main forwarding only registers/removes EventEmitter callbacks on this fake guest.
  const mainGuest = guest as unknown as Electron.WebContents
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: forwarding only uses send; it delivers to the fake Electron transport's actual preload listeners.
  const renderer = { send } as unknown as Electron.WebContents
  releases.push(
    setupGuestShortcutForwarding({
      browserTabId: 'zoom-owner-b',
      guest: mainGuest,
      resolveRenderer: () => renderer
    })
  )
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: zoom owner only calls getZoomLevel/setZoomLevel provided above.
  const aGuest = a as Electron.WebviewTag
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: zoom owner only calls getZoomLevel/setZoomLevel provided above.
  const bGuest = b as Electron.WebviewTag
  const view = render(
    createElement(
      Fragment,
      {},
      createElement(Pane, { id: 'zoom-owner-a', guest: aGuest }),
      createElement(Pane, { id: 'zoom-owner-b', guest: bGuest })
    )
  )
  const preventDefault = vi.fn()
  act(() => {
    guest.emit('zoom-changed', { preventDefault }, 'in')
  })
  expect(preventDefault).toHaveBeenCalledOnce()
  expect(send).toHaveBeenCalledWith('ui:zoomBrowserPage', {
    browserPageId: 'zoom-owner-b',
    direction: 'in'
  })
  expect(aLevel).toBe(0)
  expect(aWrites).not.toHaveBeenCalled()
  expect(bLevel).toBe(0.5)
  expect(bWrites).toHaveBeenCalledExactlyOnceWith(0.5)
  expect(getExplicitBrowserPageZoomLevel('zoom-owner-b')).toBe(0.5)
  expect(view.container.querySelector('[data-page="zoom-owner-b"]')?.textContent).toBe('0.5:0.5')
  view.unmount()
  expect(ipcRenderer.listenerCount('ui:zoomBrowserPage')).toBe(0)
  act(() => {
    guest.emit('zoom-changed', { preventDefault }, 'in')
  })
  expect(bLevel).toBe(0.5)
  for (const release of releases.splice(0)) {
    release()
  }
  expect(guest.listenerCount('zoom-changed')).toBe(0)
  expect(guest.listenerCount('before-input-event')).toBe(0)
})
