import { expect, it, vi } from 'vitest'
import {
  makeRepo,
  makeTabWithIds,
  makeWorktree
} from '@/components/activity/ActivityPrototypePage-test-fixtures'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
import type { ActivityThreadReadControl } from './activity-viewer-view'
import {
  applyActivityThreadReadCommand,
  activityThreadReadApplied,
  readActivityThreadReadStates
} from './activity-thread-read-command'

function thread(paneKey: string, unread: boolean): AgentPaneThread {
  const worktree = makeWorktree()
  return {
    paneKey,
    unread,
    worktree,
    repo: makeRepo(),
    tab: makeTabWithIds('tab', worktree.id),
    paneTitle: paneKey,
    agentType: 'claude',
    currentAgentState: null,
    currentAgentEntry: null,
    responsePreview: '',
    latestTimestamp: 1,
    latestEvent: null,
    events: []
  }
}
function controls(threads: AgentPaneThread[]): ActivityThreadReadControl {
  return {
    allThreads: threads,
    visibleThreads: threads,
    markRead: vi.fn(),
    markUnread: vi.fn(),
    markManyRead: vi.fn(),
    markManyUnread: vi.fn(),
    canMarkUnread: (thread) => thread.paneKey !== 'selected'
  }
}
const target = { viewer: 'host', surface: 'activity-page' } as const
it('dispatches only the original unread subset once and reads the full committed projection after rows vanish', () => {
  const threads = [thread('a', true), thread('selected', false), thread('b', false)]
  const control = controls(threads)
  const action = applyActivityThreadReadCommand(
    { ...target, operation: 'read-toggle-many', paneKeys: ['a', 'selected', 'b'] },
    control
  )
  expect(control.markManyRead).toHaveBeenCalledExactlyOnceWith([threads[0]])
  expect(control.markManyUnread).not.toHaveBeenCalled()
  expect(activityThreadReadApplied(control, action)).toBe(false)
  control.allThreads = threads.map((thread) => ({ ...thread, unread: false }))
  control.visibleThreads = []
  expect(activityThreadReadApplied(control, action)).toBe(true)
  expect(readActivityThreadReadStates(control, action)).toEqual([{ paneKey: 'a', unread: false }])
  control.allThreads = control.allThreads.map((thread) => ({ ...thread, latestTimestamp: 2 }))
  expect(activityThreadReadApplied(control, action)).toBe(false)
})
it('preserves single-target selection protection and uses the single callback for an eligible read target', () => {
  const threads = [thread('selected', false), thread('b', false)]
  const control = controls(threads)
  const noop = applyActivityThreadReadCommand(
    { ...target, operation: 'read-toggle', paneKey: 'selected' },
    control
  )
  expect(noop.targets).toEqual([])
  expect(control.markUnread).not.toHaveBeenCalled()
  const action = applyActivityThreadReadCommand(
    { ...target, operation: 'read-toggle', paneKey: 'b' },
    control
  )
  expect(control.markUnread).toHaveBeenCalledExactlyOnceWith(threads[1])
  control.allThreads = threads.map((thread) => ({ ...thread, unread: true }))
  expect(activityThreadReadApplied(control, action)).toBe(true)
  expect(activityThreadReadApplied({ ...control, markUnread: vi.fn() }, action)).toBe(false)
  expect(readActivityThreadReadStates(null, action)).toEqual([{ paneKey: 'b', unread: null }])
})
it('rejects a hidden or unknown member before any partial parent invocation', () => {
  const threads = [thread('visible', true), thread('hidden', true)]
  const control = controls(threads)
  control.visibleThreads = [threads[0]]
  expect(() =>
    applyActivityThreadReadCommand(
      { ...target, operation: 'read-toggle-many', paneKeys: ['visible', 'hidden'] },
      control
    )
  ).toThrow('activity_thread_unavailable')
  expect(control.markManyRead).not.toHaveBeenCalled()
  expect(control.markRead).not.toHaveBeenCalled()
})
