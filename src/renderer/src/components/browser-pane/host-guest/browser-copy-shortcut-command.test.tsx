// @vitest-environment happy-dom
import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'
import { getShortcutPlatform } from '@/hooks/useShortcutLabel'
import { requestBrowserCopyShortcut } from '@/runtime/browser-copy-shortcut-request'
import { useBrowserPageKeyboardShortcuts } from './use-browser-page-keyboard-shortcuts'
import { useBrowserGrabIntentCommands } from '../annotate/use-browser-grab-intent-commands'
import { useGrabMode } from '../annotate/useGrabMode'
import type { BrowserGrabResult } from '../../../../../shared/browser-grab-types'
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { keybindings: {} }) => unknown) => selector({ keybindings: {} })
}))
vi.mock('./use-browser-page-webview-shortcuts', () => ({ useBrowserPageWebviewShortcuts: vi.fn() }))
const api = {
  getGrabCopyShortcutPriority: vi.fn(),
  onGrabModeToggle: vi.fn(() => () => {}),
  onGrabActionShortcut: vi.fn(() => () => {}),
  setGrabMode: vi.fn(),
  cancelGrab: vi.fn(),
  awaitGrabSelection: vi.fn(() => new Promise<BrowserGrabResult>(() => {}))
}
function useOwner(active = true, markup = false): void {
  const grab = useGrabMode('page')
  const [intent, setIntent] = useState<'copy' | 'annotate'>('copy')
  const start = (value: 'copy' | 'annotate') => {
    setIntent(value)
    return grab.toggle()
  }
  useBrowserGrabIntentCommands('page', active, grab, intent, start, markup)
  useBrowserPageKeyboardShortcuts({
    browserTabId: 'page',
    workspaceId: 'workspace',
    isActive: active,
    chromeShortcutScope: active ? 'focused' : 'inactive',
    isActiveRef: useRef(active),
    markupIsActive: markup,
    webviewRef: useRef(null),
    paneZoomLevelRef: useRef(0),
    setBrowserDefaultZoomLevel: vi.fn(),
    showBrowserZoomFeedback: vi.fn(),
    reloadWebviewOrRecoverGuest: vi.fn(),
    startGrabIntent: start,
    handleGrabActionShortcut: vi.fn(),
    grabIsInteractive: grab.state !== 'idle'
  })
}
async function command() {
  let result: ReturnType<typeof requestBrowserCopyShortcut> | undefined
  await act(async () => {
    result = requestBrowserCopyShortcut('page', Date.now() + 2000)
    void result.catch(() => {})
  })
  if (!result) {
    throw new Error('request_missing')
  }
  return result
}
beforeEach(() => {
  vi.clearAllMocks()
  api.setGrabMode.mockResolvedValue({ ok: true })
  api.cancelGrab.mockResolvedValue(true)
  api.getGrabCopyShortcutPriority.mockResolvedValue({
    allowed: true,
    guestFocused: true,
    guestId: 17
  })
  Object.defineProperty(window, 'api', { configurable: true, value: { browser: api } })
  window.getSelection()?.removeAllRanges()
})
afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  Reflect.deleteProperty(window, 'api')
})
it('uses the actual keyboard owner and committed picker state for start and acknowledged cancel', async () => {
  renderHook(() => useOwner())
  expect(await command()).toMatchObject({ state: 'awaiting', intent: 'copy' })
  expect(api.setGrabMode).toHaveBeenCalledWith({ browserPageId: 'page', enabled: true })
  expect(await command()).toMatchObject({ state: 'idle' })
  expect(api.cancelGrab).toHaveBeenCalledWith({ browserPageId: 'page' })
})
it('preserves editable and renderer selection priority without guest probing or picker effects', async () => {
  renderHook(() => useOwner())
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  await expect(command()).rejects.toThrow('native_copy_priority')
  input.blur()
  const text = document.createTextNode('selected')
  document.body.append(text)
  const range = document.createRange()
  range.selectNodeContents(text)
  window.getSelection()?.addRange(range)
  await expect(command()).rejects.toThrow('native_copy_priority')
  expect(api.getGrabCopyShortcutPriority).not.toHaveBeenCalled()
  expect(api.setGrabMode).not.toHaveBeenCalled()
})
it('refuses native guest copy priority and missing old-peer acknowledgement before toggling', async () => {
  renderHook(() => useOwner())
  api.getGrabCopyShortcutPriority.mockResolvedValueOnce({
    allowed: false,
    guestFocused: true,
    guestId: 17
  })
  await expect(command()).rejects.toThrow('native_copy_priority')
  api.getGrabCopyShortcutPriority.mockResolvedValueOnce(undefined)
  await expect(command()).rejects.toThrow()
  expect(api.setGrabMode).not.toHaveBeenCalled()
})
it('selects one active owner and rejects duplicate active owners before probing', async () => {
  renderHook(() => useOwner(false))
  renderHook(() => useOwner())
  expect(await command()).toMatchObject({ state: 'awaiting' })
  cleanup()
  vi.clearAllMocks()
  renderHook(() => useOwner())
  renderHook(() => useOwner())
  await expect(command()).rejects.toThrow('ambiguous')
  expect(api.getGrabCopyShortcutPriority).not.toHaveBeenCalled()
  expect(api.setGrabMode).not.toHaveBeenCalled()
})
it('refuses markup and changed focus while native priority is pending', async () => {
  renderHook(() => useOwner(true, true))
  await expect(command()).rejects.toThrow('native_copy_priority')
  cleanup()
  renderHook(() => useOwner())
  api.getGrabCopyShortcutPriority.mockImplementationOnce(async () => {
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    return { allowed: true, guestFocused: true, guestId: 17 }
  })
  await expect(command()).rejects.toThrow('owner_changed')
  expect(api.setGrabMode).not.toHaveBeenCalled()
})

it('keeps the original keyboard chord on the same renderer priority predicate', async () => {
  renderHook(() => useOwner())
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  await act(async () => {
    fireEvent.keyDown(input, {
      key: 'c',
      ctrlKey: getShortcutPlatform() !== 'darwin',
      metaKey: getShortcutPlatform() === 'darwin'
    })
  })
  expect(api.setGrabMode).not.toHaveBeenCalled()
  input.blur()
  await act(async () => {
    fireEvent.keyDown(window, {
      key: 'c',
      ctrlKey: getShortcutPlatform() !== 'darwin',
      metaKey: getShortcutPlatform() === 'darwin'
    })
  })
  expect(api.setGrabMode).toHaveBeenCalledWith({ browserPageId: 'page', enabled: true })
})
