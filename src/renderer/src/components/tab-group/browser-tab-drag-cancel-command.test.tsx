/** @vitest-environment happy-dom */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { getDefaultSettings } from '../../../../shared/constants'
import type { Tab } from '../../../../shared/tab-types'
import type { BrowserTab as BrowserWorkspace } from '../../../../shared/browser-workspace-types'
import type { DragStartEvent, DragMoveEvent } from '@dnd-kit/core'
import { useAppStore } from '@/store'
import {
  requestBrowserTabDragCancel,
  BROWSER_TAB_DRAG_CANCEL_EVENT
} from '@/runtime/browser-tab-drag-cancel-request'
import {
  acquireWebviewsDragPassthrough,
  registerWebviewDragPassthroughSurface
} from '@/components/browser-pane/host-guest/webview-drag-passthrough'
import { applyDragPreviewTab } from './tab-drag-preview-activation'
import { useTabDragSplit } from './useTabDragSplit'
vi.mock('@/lib/worktree-runtime-owner', () => ({ getRuntimeEnvironmentIdForWorktree: () => null }))
vi.mock('@/runtime/web-runtime-session-environment', () => ({
  isWebRuntimeSessionActive: () => false,
  captureWebSessionIntentOwner: () => ({ pairingRevision: 0 })
}))
vi.mock('@/runtime/web-runtime-session', () => ({
  isWebRuntimeSessionActive: () => false,
  moveWebRuntimeSessionTab: vi.fn()
}))
const target = {
  worktree: 'folder',
  workspace: 'a',
  unifiedTab: 'a',
  group: 'left',
  environmentId: null
}
const source = {
  kind: 'tab',
  worktreeId: 'folder',
  groupId: 'left',
  unifiedTabId: 'a',
  visibleTabId: 'a',
  tabType: 'browser',
  label: 'a'
} as const
let current: ReturnType<typeof useTabDragSplit> | undefined
function Owner({ enabled = true }: { enabled?: boolean }) {
  current = useTabDragSplit({ worktreeId: 'folder', enabled })
  return null
}
function start(): void {
  const event: DragStartEvent = {
    activatorEvent: new Event('pointerdown'),
    active: {
      id: 'a',
      data: { current: source },
      rect: { current: { initial: null, translated: null } }
    }
  }
  act(() => current?.onDragStart(event))
}
function cancel() {
  return requestBrowserTabDragCancel(target, Date.now() + 1000)
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
beforeEach(() => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { set: vi.fn().mockResolvedValue(undefined) } }
  })
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
  current = undefined
})
it('cancels through the original hook and reads restored activation and released gesture resources', async () => {
  const additions = vi.spyOn(window, 'addEventListener')
  const removals = vi.spyOn(window, 'removeEventListener')
  const surface = document.createElement('div')
  const unregister = registerWebviewDragPassthroughSurface((value) => {
    surface.style.pointerEvents = value ? 'none' : 'auto'
  })
  render(<Owner />)
  start()
  expect(surface.style.pointerEvents).toBe('none')
  const move: DragMoveEvent = {
    activatorEvent: new MouseEvent('pointerdown', { clientX: 10, clientY: 10 }),
    active: {
      id: 'a',
      data: { current: source },
      rect: { current: { initial: null, translated: null } }
    },
    delta: { x: 0, y: 0 },
    collisions: null,
    over: {
      id: 'c',
      rect: new DOMRect(0, 0, 100, 30),
      disabled: false,
      data: { current: { ...source, groupId: 'right', unifiedTabId: 'c', visibleTabId: 'c' } }
    }
  }
  act(() => current?.onDragMove(move))
  expect(current?.hoveredTabInsertion).toMatchObject({ visibleTabId: 'c' })
  act(() =>
    applyDragPreviewTab({
      worktreeId: 'folder',
      groupId: 'left',
      tabId: 'a',
      activeGroupId: 'left'
    })
  )
  expect(useAppStore.getState().activeBrowserTabId).toBe('a')
  let result: ReturnType<typeof cancel> | undefined
  await act(async () => {
    result = cancel()
    void result.catch(() => {})
  })
  await expect(result).resolves.toMatchObject({
    cancelled: true,
    activeTabs: { left: 'b', right: 'c' },
    ownerPassthroughHeld: false,
    ownerMissedEndFallbackInstalled: false,
    passthroughActiveAfter: false,
    nativePointerVerified: false
  })
  expect(current?.activeDrag).toBeNull()
  expect(current?.hoveredDropTarget).toBeNull()
  expect(current?.hoveredTabInsertion).toBeNull()
  expect(useAppStore.getState().activeBrowserTabId).toBe('b')
  expect(surface.style.pointerEvents).toBe('auto')
  for (const name of ['pointerup', 'pointercancel', 'blur', 'focus']) {
    const registration = additions.mock.calls.find((call) => call[0] === name)
    expect(registration).toBeDefined()
    expect(removals.mock.calls).toContainEqual(registration)
  }
  unregister()
})
it('refuses an owner without an active gesture', async () => {
  render(<Owner />)
  await expect(cancel()).rejects.toThrow('owner_not_unique')
})
it('does not release another passthrough lease', async () => {
  const release = acquireWebviewsDragPassthrough()
  render(<Owner />)
  start()
  let result: ReturnType<typeof cancel> | undefined
  await act(async () => {
    result = cancel()
    void result.catch(() => {})
  })
  await expect(result).resolves.toMatchObject({
    ownerPassthroughHeld: false,
    passthroughActiveAfter: true
  })
  release()
})
it('refuses workspace ABA between offer and effect', async () => {
  render(<Owner />)
  start()
  const mutate = () => {
    useAppStore.setState({ activeWorktreeId: 'other' })
    useAppStore.setState({ activeWorktreeId: 'folder' })
  }
  window.addEventListener(BROWSER_TAB_DRAG_CANCEL_EVENT, mutate)
  await expect(cancel()).rejects.toThrow('stale')
  expect(current?.isTabDragActiveRef.current).toBe(true)
  window.removeEventListener(BROWSER_TAB_DRAG_CANCEL_EVENT, mutate)
  act(() => current?.onDragCancel())
})
it('refuses a replacement gesture with the same source identity', async () => {
  render(<Owner />)
  start()
  const replace = () => {
    act(() => current?.onDragCancel())
    start()
  }
  window.addEventListener(BROWSER_TAB_DRAG_CANCEL_EVENT, replace)
  await expect(cancel()).rejects.toThrow('stale_or_expired')
  expect(current?.isTabDragActiveRef.current).toBe(true)
  window.removeEventListener(BROWSER_TAB_DRAG_CANCEL_EVENT, replace)
  act(() => current?.onDragCancel())
})

it('ignores an inactive owner and refuses duplicate active gesture owners without cancelling either', async () => {
  render(<Owner enabled={false} />)
  const active = render(<Owner />)
  start()
  let result: ReturnType<typeof cancel> | undefined
  await act(async () => {
    result = cancel()
    void result.catch(() => {})
  })
  await expect(result).resolves.toMatchObject({ cancelled: true })
  active.unmount()
  render(<Owner />)
  start()
  const first = current
  render(<Owner />)
  start()
  await expect(cancel()).rejects.toThrow('owner_not_unique')
  expect(first?.isTabDragActiveRef.current).toBe(true)
  expect(current?.isTabDragActiveRef.current).toBe(true)
  act(() => {
    first?.onDragCancel()
    current?.onDragCancel()
  })
})
it('refuses success after the hard deadline even without executing its timer', async () => {
  render(<Owner />)
  start()
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  let result: ReturnType<typeof cancel> | undefined
  let observed: Promise<unknown> | undefined
  await act(async () => {
    result = cancel()
    void result.catch(() => {})
    observed = result.catch((error) => error)
    clock.mockReturnValue(now + 1001)
  })
  await expect(observed).resolves.toMatchObject({ message: expect.stringContaining('expired') })
})

it('invalidates an enabled-owner ABA before effect', async () => {
  const view = render(<Owner />)
  start()
  const change = () => {
    act(() => view.rerender(<Owner enabled={false} />))
    act(() => view.rerender(<Owner />))
  }
  window.addEventListener(BROWSER_TAB_DRAG_CANCEL_EVENT, change)
  await expect(cancel()).rejects.toThrow('stale')
  expect(current?.isTabDragActiveRef.current).toBe(true)
  window.removeEventListener(BROWSER_TAB_DRAG_CANCEL_EVENT, change)
  act(() => current?.onDragCancel())
})
