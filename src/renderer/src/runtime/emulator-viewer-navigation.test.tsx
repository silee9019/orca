// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../shared/constants'
import type { Worktree } from '../../../shared/worktree/types'
import { applyEmulatorFrame } from './emulator-frame-bridge'
import { useWorktreeJumpPaletteSelectionActions } from '../components/use-worktree-jump-palette-selection-actions'
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: (worktreeId: string) => {
    useAppStore.setState({ activeWorktreeId: worktreeId })
    return true
  }
}))
const initial = useAppStore.getInitialState()
const skipRestoreFocusRef = { current: false }
const selected = vi.fn()
function PaletteOwner() {
  useWorktreeJumpPaletteSelectionActions({
    closeModal: useAppStore.getState().closeModal,
    recordFeatureInteraction: vi.fn(),
    openSettingsTarget: vi.fn(),
    openSettingsPage: vi.fn(),
    revealSidebarRow: vi.fn(),
    skipRestoreFocusRef,
    setSelectedItemId: selected,
    previousActiveTabTypeRef: useRef<'terminal'>('terminal'),
    previousBrowserPageIdRef: useRef<string | null>(null),
    previousBrowserFocusTargetRef: useRef<'webview'>('webview'),
    previousWorktreeIdRef: useRef<string | null>(null),
    previousFocusElementRef: useRef<HTMLElement | null>(null),
    focusFallbackSurface: vi.fn(),
    requestBrowserFocus: vi.fn(),
    buildQuickActionContext: vi.fn()
  })
  return null
}
function seed() {
  const worktree: Worktree = {
    id: 'folder-mobile',
    repoId: 'repo',
    path: '/fixture/folder',
    head: '',
    branch: '',
    isBare: false,
    isMainWorktree: false,
    displayName: 'Folder',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
  useAppStore.setState(
    {
      ...initial,
      settings: getDefaultSettings('/fixture/home'),
      persistedUIReady: true,
      activeWorktreeId: worktree.id,
      worktreesByRepo: { repo: [worktree] },
      groupsByWorktree: {
        [worktree.id]: [
          { id: 'a', worktreeId: worktree.id, activeTabId: null, tabOrder: [] },
          { id: 'b', worktreeId: worktree.id, activeTabId: 'sim', tabOrder: ['sim'] }
        ]
      },
      activeGroupIdByWorktree: { [worktree.id]: 'a' },
      unifiedTabsByWorktree: {
        [worktree.id]: [
          {
            id: 'sim',
            entityId: 'sim-entity',
            groupId: 'b',
            worktreeId: worktree.id,
            contentType: 'simulator',
            executionHostId: 'local',
            label: 'Simulator',
            customLabel: null,
            color: null,
            sortOrder: 0,
            createdAt: 0
          }
        ]
      }
    },
    true
  )
}
afterEach(() => {
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  vi.clearAllMocks()
  document.body.innerHTML = ''
  skipRestoreFocusRef.current = false
})
it('uses actual group store effects and exact Palette selection closure without OS focus', async () => {
  seed()
  document.body.innerHTML = '<div data-emulator-tab-id="sim"></div>'
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 200)
  )
  const request = { id: 'navigation', worktreeId: 'folder-mobile', expiresAt: Date.now() + 9000 }
  await expect(
    applyEmulatorFrame({
      ...request,
      frame: { tabId: 'sim', action: { type: 'focus-group', groupId: 'b' } }
    })
  ).resolves.toMatchObject({ groupId: 'b' })
  expect(useAppStore.getState().activeGroupIdByWorktree['folder-mobile']).toBe('b')
  await expect(
    applyEmulatorFrame({
      ...request,
      frame: { tabId: 'sim', action: { type: 'focus-group', groupId: 'a' } }
    })
  ).rejects.toThrow('emulator_group_mismatch')
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<PaletteOwner />))
  useAppStore.setState({ activeModal: 'worktree-palette' })
  try {
    await expect(
      applyEmulatorFrame({
        ...request,
        frame: { tabId: 'sim', action: { type: 'select-tab', executionHostId: 'local' } }
      })
    ).resolves.toMatchObject({ tabId: 'sim', groupId: 'b' })
    expect(useAppStore.getState().activeTabType).toBe('simulator')
    expect(useAppStore.getState().activeModal).toBe('none')
    expect(skipRestoreFocusRef.current).toBe(true)
    expect(selected).toHaveBeenCalledWith('')
    await expect(
      applyEmulatorFrame({
        ...request,
        frame: { tabId: 'sim', action: { type: 'select-tab', executionHostId: 'ssh:wrong-host' } }
      })
    ).rejects.toThrow('emulator_frame_unavailable')
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
