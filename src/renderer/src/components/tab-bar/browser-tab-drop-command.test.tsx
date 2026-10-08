/** @vitest-environment happy-dom */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { getDefaultSettings } from '../../../../shared/constants'
import type { Tab } from '../../../../shared/tab-types'
import type { BrowserTab as BrowserWorkspace } from '../../../../shared/browser-workspace-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { BROWSER_TAB_DROP_EVENT, requestBrowserTabDrop } from '@/runtime/browser-tab-drop-request'
import type { BrowserTabDropTarget } from '../../../../shared/rpc-contract/browser-tab-drop-params'
import BrowserTab from './BrowserTab'
import { moveWebRuntimeSessionTab } from '@/runtime/web-runtime-session-tab-move'

const fixture: {
  environment: string | null
  revision: number
  move: ReturnType<typeof vi.fn>
  rpc: ReturnType<typeof vi.fn>
  capture: ReturnType<typeof vi.fn<(environmentId: string, revision: number) => void>>
  hostTab: string | null
} = vi.hoisted(() => ({
  environment: null,
  revision: 0,
  move: vi.fn(),
  rpc: vi.fn(),
  capture: vi.fn(),
  hostTab: null
}))
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {} })
}))
vi.mock('./use-tab-strip-slot-props', () => ({ useTabStripSlotProps: () => ({}) }))
vi.mock('./use-browser-tab-ui-commands', () => ({ useBrowserTabUiCommands: () => {} }))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getRuntimeEnvironmentIdForWorktree: () => fixture.environment
}))
vi.mock('@/runtime/web-runtime-session-environment', () => ({
  isWebRuntimeSessionActive: () => fixture.environment !== null,
  captureRuntimeEnvironmentCall: (environmentId: string, revision: number) => {
    fixture.capture(environmentId, revision)
    return fixture.rpc
  },
  captureWebSessionIntentOwner: () => ({
    environmentId: fixture.environment,
    pairingRevision: fixture.revision
  })
}))
vi.mock('@/runtime/web-session-tabs-sync', () => ({
  resolveHostSessionTabIdForWebSessionTab: (_state: unknown, args: { tabId: string }) =>
    args.tabId === 'a' ? fixture.hostTab : null
}))
vi.mock('@/runtime/web-runtime-session', () => ({
  isWebRuntimeSessionActive: () => fixture.environment !== null,
  moveWebRuntimeSessionTab: fixture.move
}))
const target: BrowserTabDropTarget = {
  worktree: 'folder',
  workspace: 'a',
  unifiedTab: 'a',
  group: 'left',
  environmentId: null
}
function tab(id: string, groupId: string): Tab {
  return {
    id,
    groupId,
    worktreeId: 'folder',
    contentType: 'browser',
    entityId: id,
    label: id,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
}
function workspace(id: string): BrowserWorkspace {
  return {
    id,
    worktreeId: 'folder',
    label: id,
    sessionProfileId: null,
    activePageId: null,
    pageIds: [],
    url: 'https://example.com/',
    title: id,
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 0
  }
}
function Owner() {
  return (
    <TooltipProvider>
      <BrowserTab
        tab={workspace('a')}
        isActive={false}
        isPinned={false}
        hasTabsToRight
        hasTabsToLeft={false}
        tabCount={3}
        onActivate={() => {}}
        onClose={() => {}}
        onCloseOthers={() => {}}
        onCloseToLeft={() => {}}
        onCloseToRight={() => {}}
        onTogglePin={() => {}}
        dragData={{
          kind: 'tab',
          worktreeId: 'folder',
          groupId: 'left',
          unifiedTabId: 'a',
          visibleTabId: 'a',
          tabType: 'browser',
          label: 'a'
        }}
      />
    </TooltipProvider>
  )
}
function drop(selected = target) {
  return requestBrowserTabDrop(selected, { kind: 'pane', group: 'right' }, Date.now() + 1000)
}
beforeEach(() => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { set: vi.fn().mockResolvedValue(undefined) } }
  })
  fixture.hostTab = null
  fixture.rpc.mockReset()
  fixture.capture.mockReset()
  fixture.environment = null
  fixture.revision = 0
  fixture.move.mockReset()
  fixture.move.mockResolvedValue(true)
  useAppStore.setState({
    settings: getDefaultSettings(tmpdir()),
    persistedUIReady: true,
    activeModal: 'none',
    activeWorktreeId: 'folder',
    activeGroupIdByWorktree: { folder: 'left' },
    activeTabType: 'browser',
    activeTabTypeByWorktree: { folder: 'browser' },
    activeBrowserTabId: 'b',
    activeBrowserTabIdByWorktree: { folder: 'b' },
    browserTabsByWorktree: { folder: [workspace('a'), workspace('b'), workspace('c')] },
    browserPagesByWorkspace: {},
    remoteBrowserPageHandlesByPageId: {},
    unifiedTabsByWorktree: { folder: [tab('a', 'left'), tab('b', 'left'), tab('c', 'right')] },
    groupsByWorktree: {
      folder: [
        { id: 'left', worktreeId: 'folder', activeTabId: 'b', tabOrder: ['a', 'b'] },
        { id: 'right', worktreeId: 'folder', activeTabId: 'c', tabOrder: ['c'] }
      ]
    },
    layoutByWorktree: {
      folder: {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: { type: 'leaf', groupId: 'left' },
        second: { type: 'leaf', groupId: 'right' }
      }
    }
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
it('the actual BrowserTab connects the existing drop writer and preserves source selection', async () => {
  render(<Owner />)
  await expect(drop()).resolves.toMatchObject({
    moved: true,
    group: 'right',
    order: ['c', 'a'],
    activeTabs: { left: 'b' },
    hostMoveAcknowledged: false,
    nativePointerVerified: false
  })
  expect(
    useAppStore.getState().unifiedTabsByWorktree.folder.find((item) => item.id === 'a')?.groupId
  ).toBe('right')
  expect(fixture.move).not.toHaveBeenCalled()
})
it('refuses duplicate mounted owners before any Store effect', async () => {
  render(
    <>
      <Owner />
      <Owner />
    </>
  )
  await expect(drop()).rejects.toThrow('owner_not_unique')
  expect(useAppStore.getState().groupsByWorktree.folder[0].tabOrder).toEqual(['a', 'b'])
})
it('invalidates workspace ABA between offer collection and execution', async () => {
  render(<Owner />)
  const swap = () => {
    useAppStore.setState({ activeWorktreeId: 'other' })
    useAppStore.setState({ activeWorktreeId: 'folder' })
  }
  window.addEventListener(BROWSER_TAB_DROP_EVENT, swap)
  try {
    await expect(drop()).rejects.toThrow('stale_or_expired')
  } finally {
    window.removeEventListener(BROWSER_TAB_DROP_EVENT, swap)
  }
  expect(useAppStore.getState().groupsByWorktree.folder[0].tabOrder).toEqual(['a', 'b'])
})
it('waits for explicit paired completion and refuses a failed acknowledgment', async () => {
  fixture.environment = 'paired'
  fixture.move.mockResolvedValue(false)
  render(<Owner />)
  await expect(drop({ ...target, environmentId: 'paired' })).rejects.toThrow('host_ack_unknown')
  expect(fixture.move).toHaveBeenCalledWith(
    expect.objectContaining({ requireAcknowledgedMove: true, environmentId: 'paired' })
  )
})
it('rejects paired workspace ABA while the host acknowledgment is pending', async () => {
  fixture.environment = 'paired'
  let finish: (value: boolean) => void = () => {}
  fixture.move.mockReturnValue(
    new Promise<boolean>((resolve) => {
      finish = resolve
    })
  )
  render(<Owner />)
  const pending = drop({ ...target, environmentId: 'paired' })
  act(() => {
    useAppStore.setState({ activeWorktreeId: 'other' })
    useAppStore.setState({ activeWorktreeId: 'folder' })
  })
  finish(true)
  await expect(pending).rejects.toThrow('stale_or_expired')
})
it('checks the deadline after host completion even before the timeout task runs', async () => {
  fixture.environment = 'paired'
  let finish: (value: boolean) => void = () => {}
  fixture.move.mockReturnValue(
    new Promise<boolean>((resolve) => {
      finish = resolve
    })
  )
  render(<Owner />)
  const now = Date.now()
  const pending = requestBrowserTabDrop(
    { ...target, environmentId: 'paired' },
    { kind: 'pane', group: 'right' },
    now + 1000
  )
  vi.spyOn(Date, 'now').mockReturnValue(now + 1001)
  finish(true)
  await expect(pending).rejects.toThrow('expired')
})
it('refuses the wrong execution environment before mutation', async () => {
  render(<Owner />)
  await expect(drop({ ...target, environmentId: 'paired' })).rejects.toThrow('owner_not_unique')
  expect(useAppStore.getState().groupsByWorktree.folder[0].tabOrder).toEqual(['a', 'b'])
})

it('accepts an explicit paired acknowledgment after the original move unmounts its source row', async () => {
  fixture.environment = 'paired'
  let finish: (value: boolean) => void = () => {}
  fixture.move.mockReturnValue(
    new Promise<boolean>((resolve) => {
      finish = resolve
    })
  )
  const view = render(<Owner />)
  const pending = drop({ ...target, environmentId: 'paired' })
  view.unmount()
  finish(true)
  await expect(pending).resolves.toMatchObject({ group: 'right', hostMoveAcknowledged: true })
})
it('reuses the same owner for tab reorder and split destinations', async () => {
  render(<Owner />)
  await expect(
    requestBrowserTabDrop(
      target,
      { kind: 'tab', group: 'left', tab: 'b', side: 'right' },
      Date.now() + 1000
    )
  ).resolves.toMatchObject({ group: 'left', order: ['b', 'a'], activeTabs: { left: 'b' } })
  await expect(
    requestBrowserTabDrop(
      target,
      { kind: 'split', group: 'right', direction: 'down' },
      Date.now() + 1000
    )
  ).resolves.toMatchObject({ moved: true, order: ['a'], hostMoveAcknowledged: false })
})
it('invalidates a replaced pairing generation while awaiting the host', async () => {
  fixture.environment = 'paired'
  let finish: (value: boolean) => void = () => {}
  fixture.move.mockReturnValue(
    new Promise<boolean>((resolve) => {
      finish = resolve
    })
  )
  render(<Owner />)
  const pending = drop({ ...target, environmentId: 'paired' })
  fixture.revision += 1
  finish(true)
  await expect(pending).rejects.toThrow('stale_or_expired')
})
it('invalidates reentrant group ABA during the original writer completion', async () => {
  let changed = false
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: {
        set: () => {
          if (!changed) {
            changed = true
            const groups = useAppStore.getState().groupsByWorktree
            useAppStore.setState({ groupsByWorktree: { ...groups, folder: [...groups.folder] } })
            useAppStore.setState({ groupsByWorktree: groups })
          }
          return Promise.resolve(undefined)
        }
      }
    }
  })
  render(<Owner />)
  await expect(drop()).rejects.toThrow('stale_or_expired')
})

it.each([true, false])(
  'connects the actual owner/mirror/move helper to explicit host acknowledgment=%s',
  async (acknowledged) => {
    fixture.environment = 'paired'
    fixture.hostTab = 'host-a'
    fixture.rpc.mockResolvedValue({
      id: 'move',
      ok: true,
      result: acknowledged ? { moved: true } : undefined
    })
    fixture.move.mockImplementation(moveWebRuntimeSessionTab)
    render(<Owner />)
    const pending = drop({ ...target, environmentId: 'paired' })
    await (acknowledged
      ? expect(pending).resolves.toMatchObject({ group: 'right', hostMoveAcknowledged: true })
      : expect(pending).rejects.toThrow('host_ack_unknown'))
    expect(fixture.capture).toHaveBeenCalledWith('paired', 0)
    expect(fixture.rpc).toHaveBeenCalledWith({
      method: 'session.tabs.move',
      params: {
        worktree: 'id:folder',
        tabId: 'host-a',
        targetGroupId: 'right',
        kind: 'move-to-group',
        index: undefined
      },
      timeoutMs: 15000
    })
  }
)
