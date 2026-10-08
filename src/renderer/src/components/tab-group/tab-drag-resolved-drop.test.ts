/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tab } from '../../../../shared/tab-types'
import { useAppStore } from '../../store'
import { commitResolvedTabDrop } from './tab-drag-drop-commit'
import type { TabDragItemData } from './tab-drag-data'

const mirror = vi.hoisted(() => ({ move: vi.fn() }))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getRuntimeEnvironmentIdForWorktree: () => 'environment-1'
}))
vi.mock('../../runtime/web-runtime-session', () => ({
  isWebRuntimeSessionActive: () => true,
  moveWebRuntimeSessionTab: mirror.move
}))

function tab(id: string, groupId: string): Tab {
  return {
    id,
    groupId,
    worktreeId: 'folder-1',
    contentType: 'browser',
    entityId: id,
    label: id,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
}
function source(id = 'a', groupId = 'left'): TabDragItemData {
  return {
    kind: 'tab',
    worktreeId: 'folder-1',
    groupId,
    unifiedTabId: id,
    visibleTabId: id,
    tabType: 'browser',
    label: id
  }
}
function actions() {
  const state = useAppStore.getState()
  return {
    worktreeId: 'folder-1',
    dropUnifiedTab: state.dropUnifiedTab,
    reorderUnifiedTabs: state.reorderUnifiedTabs,
    finishDrag: vi.fn(),
    observeMirror: vi.fn()
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  mirror.move.mockResolvedValue(true)
  useAppStore.setState({
    activeWorktreeId: 'folder-1',
    activeGroupIdByWorktree: { 'folder-1': 'left' },
    groupsByWorktree: {
      'folder-1': [
        { id: 'left', worktreeId: 'folder-1', activeTabId: 'b', tabOrder: ['a', 'b', 'c'] },
        { id: 'right', worktreeId: 'folder-1', activeTabId: 'd', tabOrder: ['d'] }
      ]
    },
    unifiedTabsByWorktree: {
      'folder-1': [tab('a', 'left'), tab('b', 'left'), tab('c', 'left'), tab('d', 'right')]
    },
    layoutByWorktree: {
      'folder-1': {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: { type: 'leaf', groupId: 'left' },
        second: { type: 'leaf', groupId: 'right' }
      }
    }
  })
})
describe('resolved browser tab drop uses the original Store actions', () => {
  it('reorders to the hovered side and preserves the activation restore decision', async () => {
    const owner = actions()
    expect(
      commitResolvedTabDrop(source(), { kind: 'tab', tab: source('c'), side: 'right' }, owner)
    ).toBe(true)
    expect(useAppStore.getState().groupsByWorktree['folder-1'][0].tabOrder).toEqual(['b', 'c', 'a'])
    expect(owner.finishDrag).toHaveBeenCalledWith(true, undefined)
    expect(owner.observeMirror).toHaveBeenCalledTimes(1)
    await expect(owner.observeMirror.mock.calls[0]?.[0]).resolves.toBe(true)
    expect(mirror.move.mock.calls[0]?.[0]).toMatchObject({
      requireAcknowledgedMove: true,
      kind: 'reorder'
    })
  })
  it('moves before a tab in another group with the original source restore identity', () => {
    const owner = actions()
    expect(
      commitResolvedTabDrop(
        source(),
        { kind: 'tab', tab: source('d', 'right'), side: 'left' },
        owner
      )
    ).toBe(true)
    const state = useAppStore.getState()
    expect(state.groupsByWorktree['folder-1'][1].tabOrder).toEqual(['a', 'd'])
    expect(state.unifiedTabsByWorktree['folder-1'].find((item) => item.id === 'a')?.groupId).toBe(
      'right'
    )
    expect(owner.finishDrag).toHaveBeenCalledWith(false, source())
  })
  it('moves into a pane using the existing group insertion order', () => {
    const owner = actions()
    expect(commitResolvedTabDrop(source(), { kind: 'pane', groupId: 'right' }, owner)).toBe(true)
    expect(useAppStore.getState().groupsByWorktree['folder-1'][1].tabOrder).toEqual(['d', 'a'])
    expect(owner.finishDrag).toHaveBeenCalledWith(false, source())
  })
  it('splits a pane through the existing layout writer and mirrors the original target', () => {
    const owner = actions()
    expect(
      commitResolvedTabDrop(source(), { kind: 'split', groupId: 'right', direction: 'down' }, owner)
    ).toBe(true)
    const state = useAppStore.getState()
    const moved = state.unifiedTabsByWorktree['folder-1'].find((item) => item.id === 'a')
    expect(moved?.groupId).not.toBe('left')
    expect(moved?.groupId).not.toBe('right')
    expect(
      state.groupsByWorktree['folder-1'].find((group) => group.id === moved?.groupId)?.tabOrder
    ).toEqual(['a'])
    expect(mirror.move.mock.calls[0]?.[0]).toMatchObject({
      targetGroupId: 'right',
      kind: 'split',
      splitDirection: 'down'
    })
    expect(owner.finishDrag).toHaveBeenCalledWith(false, source())
  })
  it('does not mirror a no-op or a foreign-workspace source', () => {
    const owner = actions()
    expect(
      commitResolvedTabDrop(source(), { kind: 'tab', tab: source(), side: 'left' }, owner)
    ).toBe(false)
    expect(
      commitResolvedTabDrop(
        { ...source(), worktreeId: 'foreign' },
        { kind: 'pane', groupId: 'right' },
        owner
      )
    ).toBe(false)
    expect(mirror.move).not.toHaveBeenCalled()
    expect(owner.observeMirror).not.toHaveBeenCalled()
    expect(useAppStore.getState().groupsByWorktree['folder-1'][0].tabOrder).toEqual(['a', 'b', 'c'])
  })
})
