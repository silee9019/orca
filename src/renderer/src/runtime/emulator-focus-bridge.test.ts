// @vitest-environment happy-dom
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
import { applyEmulatorFocus } from './emulator-focus-bridge'
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
