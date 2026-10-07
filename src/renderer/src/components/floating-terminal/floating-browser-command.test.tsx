// @vitest-environment happy-dom
import { useFloatingTerminalPanelStoreState } from './use-floating-terminal-panel-store-state'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { FLOATING_TERMINAL_WORKTREE_ID as workspace } from '../../../../shared/constants'
import { requestFloatingBrowser } from '@/runtime/floating-browser-request'
import { useFloatingTerminalCreateActions } from './use-floating-terminal-create-actions'
const surface = vi.hoisted(() => ({ paired: false }))
vi.mock('@/lib/desktop-window-chrome', () => ({ isPairedWebClientWindow: () => surface.paired }))
afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})
it('uses the mounted creation owner and reads the actual floating group/address intent', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const state = useAppStore.getState()
  const groupId = state.ensureWorktreeRootGroup(workspace)
  const group = useAppStore
    .getState()
    .groupsByWorktree[workspace]?.find((value) => value.id === groupId)
  if (!group) {
    throw new Error('Fixture group missing')
  }
  useAppStore.setState({
    activeModal: 'none',
    browserDefaultUrl: 'https://fixture.invalid/private'
  })
  function Owner({ open = true }: { open?: boolean }) {
    const current = useFloatingTerminalPanelStoreState()
    useFloatingTerminalCreateActions({
      activateTab: current.activateTab,
      setActiveTab: current.setActiveTab,
      createBrowserTab: current.createBrowserTab,
      browserDefaultUrl: current.browserDefaultUrl,
      openFile: current.openFile,
      activeGroup: current.groups.find((value) => value.id === groupId) ?? null,
      browserTabs: current.browserTabs,
      viewerOpen: open,
      groupTabs: [],
      markdownCwd: null
    })
    return null
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(createElement(Owner)))
  try {
    let result: ReturnType<typeof requestFloatingBrowser> | undefined
    await act(async () => {
      result = requestFloatingBrowser({ action: 'new', groupId: group.id }, Date.now() + 1000)
    })
    expect(result?.groupId).toBe(group.id)
    expect(result?.addressFocusRequested).toBe(true)
    const tab = useAppStore
      .getState()
      .browserTabsByWorktree[workspace]?.find((tab) => tab.id === result?.browserTabId)
    expect(tab?.url).toBe('https://fixture.invalid/private')
    expect(
      useAppStore.getState().browserPagesByWorkspace[tab?.id ?? '']?.[0].browserRuntimeEnvironmentId
    ).toBeNull()
    let source: ReturnType<typeof state.createBrowserTab> | undefined
    let tail: ReturnType<typeof state.createBrowserTab> | undefined
    await act(async () => {
      source = useAppStore
        .getState()
        .createBrowserTab(workspace, 'https://private-fixture.invalid', {
          title: 'private-fixture-title',
          sessionProfileId: 'private-fixture-profile',
          sessionPartition: 'persist:private-fixture-partition',
          targetGroupId: group.id,
          browserRuntimeEnvironmentId: null
        })
      tail = useAppStore.getState().createBrowserTab(workspace, 'https://tail.invalid', {
        targetGroupId: group.id,
        browserRuntimeEnvironmentId: null
      })
    })
    const sourceTab = source
    if (!sourceTab || !tail) {
      throw new Error('Duplicate fixture missing')
    }
    const sourceWrapper = useAppStore
      .getState()
      .unifiedTabsByWorktree[workspace]?.find((value) => value.entityId === sourceTab.id)
    if (!sourceWrapper) {
      throw new Error('Source wrapper missing')
    }
    let duplicate: ReturnType<typeof requestFloatingBrowser> | undefined
    await act(async () => {
      duplicate = requestFloatingBrowser(
        {
          action: 'duplicate',
          groupId: group.id,
          browserTabId: sourceTab.id,
          sourceUnifiedTabId: sourceWrapper.id
        },
        Date.now() + 1000
      )
    })
    expect(duplicate?.profilePreserved).toBe(true)
    expect(duplicate?.partitionPreserved).toBe(true)
    const copied = useAppStore
      .getState()
      .browserTabsByWorktree[workspace]?.find((tab) => tab.id === duplicate?.browserTabId)
    expect(copied).toMatchObject({
      url: sourceTab.url,
      title: sourceTab.title,
      sessionProfileId: sourceTab.sessionProfileId,
      sessionPartition: sourceTab.sessionPartition
    })
    const order =
      useAppStore.getState().groupsByWorktree[workspace]?.find((value) => value.id === group.id)
        ?.tabOrder ?? []
    expect(order.indexOf(duplicate?.unifiedTabId ?? '')).toBe(order.indexOf(sourceWrapper.id) + 1)
    expect(JSON.stringify(duplicate)).not.toContain('private-fixture')
    const count = useAppStore.getState().browserTabsByWorktree[workspace]?.length
    expect(() =>
      requestFloatingBrowser(
        {
          action: 'duplicate',
          groupId: group.id,
          browserTabId: sourceTab.id,
          sourceUnifiedTabId: 'wrong-wrapper'
        },
        Date.now() + 1000
      )
    ).toThrow('effect_unknown')
    expect(() =>
      requestFloatingBrowser({ action: 'new', groupId: 'wrong-group' }, Date.now() + 1000)
    ).toThrow('effect_unknown')
    expect(() =>
      requestFloatingBrowser({ action: 'new', groupId: group.id }, Date.now() - 1)
    ).toThrow('effect_unknown')
    await act(async () => root.render(createElement(Owner, { open: false })))
    expect(() =>
      requestFloatingBrowser({ action: 'new', groupId: group.id }, Date.now() + 1000)
    ).toThrow('effect_unknown')
    await act(async () => root.render(createElement(Owner)))
    surface.paired = true
    expect(() =>
      requestFloatingBrowser({ action: 'new', groupId: group.id }, Date.now() + 1000)
    ).toThrow('effect_unknown')
    expect(useAppStore.getState().browserTabsByWorktree[workspace]?.length).toBe(count)
    surface.paired = false
  } finally {
    await act(async () => root.unmount())
  }
})
