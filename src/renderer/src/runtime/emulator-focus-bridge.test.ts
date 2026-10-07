// @vitest-environment happy-dom
import type { EmulatorFocusRequest } from '../../../shared/emulator-focus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  persistedUIReady: true,
  settings: { activeRuntimeEnvironmentId: '' },
  activeWorktreeId: 'other',
  groupsByWorktree: { 'folder-mobile': [{ id: 'group', activeTabId: 'sim-tab' }] },
  activeGroupIdByWorktree: { 'folder-mobile': 'group' },
  unifiedTabsByWorktree: { 'folder-mobile': [{ id: 'sim-tab', groupId: 'group' }] },
  setActiveWorktree: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
vi.mock('@/lib/ensure-simulator-tab', () => ({ ensureSimulatorTab: vi.fn(() => 'sim-tab') }))
import { applyEmulatorFocus, attachEmulatorFocusBridge } from './emulator-focus-bridge'
import { ensureSimulatorTab } from '@/lib/ensure-simulator-tab'
const request = () => ({
  id: 'focus-request',
  worktreeId: 'folder-mobile',
  expiresAt: Date.now() + 10000
})
beforeEach(() => {
  state.activeWorktreeId = 'other'
  state.settings.activeRuntimeEnvironmentId = ''
  state.setActiveWorktree.mockImplementation((id: string) => {
    state.activeWorktreeId = id
  })
  document.body.innerHTML = '<div data-emulator-tab-id="sim-tab"></div>'
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 200)
  )
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0)
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
describe('emulator pane focus renderer effect', () => {
  it('selects the folder workspace, reuses its simulator tab and reads rendered group focus', async () => {
    await expect(applyEmulatorFocus(request())).resolves.toMatchObject({
      worktreeId: 'folder-mobile',
      tabId: 'sim-tab',
      groupId: 'group',
      applied: true
    })
    expect(ensureSimulatorTab).toHaveBeenCalledWith(
      'folder-mobile',
      expect.objectContaining({ surfacePane: true })
    )
  })
  it('does not mutate a viewer displaying a different runtime', async () => {
    state.settings.activeRuntimeEnvironmentId = 'remote'
    await expect(applyEmulatorFocus(request())).rejects.toThrow('viewer_runtime_mismatch')
    expect(state.setActiveWorktree).not.toHaveBeenCalled()
  })
  it('rejects an expired request before changing selection', async () => {
    await expect(applyEmulatorFocus({ ...request(), expiresAt: 0 })).rejects.toThrow(
      'request_expired'
    )
    expect(state.setActiveWorktree).not.toHaveBeenCalled()
  })
  it('does not claim focus without a rendered pane', async () => {
    document.body.innerHTML = ''
    await expect(applyEmulatorFocus(request())).rejects.toThrow('viewer_focus_not_applied')
  })
})

it('discards queued focus and frame requests after bridge cleanup', async () => {
  const api = Object.getOwnPropertyDescriptor(window, 'api')
  const focusCallbacks: ((request: EmulatorFocusRequest) => void)[] = []
  const frameCallbacks: typeof focusCallbacks = []
  const unsubscribeFocus = vi.fn()
  const unsubscribeFrame = vi.fn()
  const respondFocus = vi.fn()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      emulator: {
        onFocusRequest: (callback: (typeof focusCallbacks)[number]) => {
          focusCallbacks.push(callback)
          return unsubscribeFocus
        },
        onFrameRequest: (callback: (typeof frameCallbacks)[number]) => {
          frameCallbacks.push(callback)
          return unsubscribeFrame
        },
        respondFocus
      }
    }
  })
  try {
    const detach = attachEmulatorFocusBridge()
    focusCallbacks[0](request())
    frameCallbacks[0]({
      ...request(),
      id: 'frame-request',
      frame: { tabId: 'sim-tab', action: { type: 'rotate' } }
    })
    detach()
    for (let turn = 0; turn < 8; turn += 1) {
      await Promise.resolve()
    }
    expect(unsubscribeFocus).toHaveBeenCalledTimes(1)
    expect(unsubscribeFrame).toHaveBeenCalledTimes(1)
    expect(state.setActiveWorktree).not.toHaveBeenCalled()
    expect(respondFocus).not.toHaveBeenCalled()
  } finally {
    if (api) {
      Object.defineProperty(window, 'api', api)
    } else {
      Reflect.deleteProperty(window, 'api')
    }
  }
})

it('preserves the entry point when the emulator preload API is absent', () => {
  const api = Object.getOwnPropertyDescriptor(window, 'api')
  Object.defineProperty(window, 'api', { configurable: true, value: {} })
  try {
    expect(() => attachEmulatorFocusBridge()()).not.toThrow()
    expect(state.setActiveWorktree).not.toHaveBeenCalled()
  } finally {
    if (api) {
      Object.defineProperty(window, 'api', api)
    } else {
      Reflect.deleteProperty(window, 'api')
    }
  }
})

it('suppresses the response when cleanup occurs during an already started focus request', async () => {
  const api = Object.getOwnPropertyDescriptor(window, 'api')
  const callbacks: ((request: EmulatorFocusRequest) => void)[] = []
  const frames: FrameRequestCallback[] = []
  const respondFocus = vi.fn()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      emulator: {
        onFocusRequest: (callback: (typeof callbacks)[number]) => {
          callbacks.push(callback)
          return () => {}
        },
        respondFocus
      }
    }
  })
  try {
    const detach = attachEmulatorFocusBridge()
    callbacks[0](request())
    await Promise.resolve()
    expect(state.setActiveWorktree).toHaveBeenCalledTimes(1)
    expect(frames).toHaveLength(1)
    detach()
    frames[0](0)
    expect(frames).toHaveLength(2)
    frames[1](0)
    for (let turn = 0; turn < 8; turn += 1) {
      await Promise.resolve()
    }
    expect(respondFocus).not.toHaveBeenCalled()
    expect(state.setActiveWorktree).toHaveBeenCalledTimes(1)
  } finally {
    if (api) {
      Object.defineProperty(window, 'api', api)
    } else {
      Reflect.deleteProperty(window, 'api')
    }
  }
})
