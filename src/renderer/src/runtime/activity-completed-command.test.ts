import { expect, it, vi } from 'vitest'
import {
  makeRepo,
  makeTabWithIds,
  makeWorktree
} from '@/components/activity/ActivityPrototypePage-test-fixtures'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
import type { ActivityCompletedControl } from './activity-viewer-view'
import {
  applyActivityCompletedCommand,
  activityCompletedApplied
} from './activity-completed-command'

function thread(paneKey: string): AgentPaneThread {
  const worktree = makeWorktree()
  return {
    paneKey,
    unread: false,
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
it('calls the original filtered parent once and waits for removal from the full committed projection', () => {
  const visible = thread('visible')
  const hidden = thread('hidden')
  const control: ActivityCompletedControl = {
    run: vi.fn(),
    hasCompletedThreads: true,
    visibleThreads: [visible],
    allThreads: [visible, hidden]
  }
  const action = applyActivityCompletedCommand(control)
  expect(action.targets).toEqual([visible])
  expect(control.run).toHaveBeenCalledTimes(1)
  expect(activityCompletedApplied(control, action)).toBe(false)
  expect(
    activityCompletedApplied(
      { ...control, visibleThreads: [], allThreads: [visible, hidden] },
      action
    )
  ).toBe(false)
  expect(
    activityCompletedApplied({ ...control, visibleThreads: [], allThreads: [hidden] }, action)
  ).toBe(true)
  expect(activityCompletedApplied({ ...control, run: vi.fn(), allThreads: [hidden] }, action)).toBe(
    false
  )
  expect(activityCompletedApplied(null, action)).toBe(false)
})
it('preserves the disabled parent and excludes live working threads', () => {
  const live = { ...thread('live'), currentAgentState: 'working' as const }
  const control: ActivityCompletedControl = {
    run: vi.fn(),
    hasCompletedThreads: false,
    visibleThreads: [live],
    allThreads: [live]
  }
  const action = applyActivityCompletedCommand(control)
  expect(action.targets).toEqual([])
  expect(control.run).not.toHaveBeenCalled()
  expect(activityCompletedApplied(control, action)).toBe(true)
})
it('does not treat a newer thread with the same key as the cleared turn', () => {
  const visible = thread('visible')
  const control: ActivityCompletedControl = {
    run: vi.fn(),
    hasCompletedThreads: true,
    visibleThreads: [visible],
    allThreads: [visible]
  }
  const action = applyActivityCompletedCommand(control)
  expect(
    activityCompletedApplied(
      { ...control, allThreads: [{ ...visible, latestTimestamp: 2 }] },
      action
    )
  ).toBe(false)
})
