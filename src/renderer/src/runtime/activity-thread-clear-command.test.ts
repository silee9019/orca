import { afterEach, expect, it, vi } from 'vitest'
import {
  makeRepo,
  makeTabWithIds,
  makeWorktree
} from '@/components/activity/ActivityPrototypePage-test-fixtures'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
import type { ActivityCompletedControl } from './activity-viewer-view'
import * as clearing from '@/components/activity/activity-clear-completed'
import { applyActivityThreadClearCommand } from './activity-completed-command'
const single = vi.spyOn(clearing, 'clearActivityThread').mockReturnValue(true)
const many = vi.spyOn(clearing, 'clearCompletedActivity').mockReturnValue(true)
afterEach(() => {
  single.mockClear()
  many.mockClear()
})
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
function control(threads: AgentPaneThread[]): ActivityCompletedControl {
  return { run: vi.fn(), hasCompletedThreads: true, visibleThreads: threads, allThreads: threads }
}
const target = { viewer: 'host', surface: 'activity-page' } as const
it('uses the original immediate single clear and deferred bulk clearable subset once', () => {
  const done = thread('done')
  const working = { ...thread('working'), currentAgentState: 'working' as const }
  const threads = [done, working]
  const owner = control(threads)
  expect(
    applyActivityThreadClearCommand(
      { ...target, operation: 'clear-thread', paneKey: 'done' },
      owner,
      threads
    ).targets
  ).toEqual([done])
  expect(single).toHaveBeenCalledExactlyOnceWith(done)
  expect(many).not.toHaveBeenCalled()
  expect(
    applyActivityThreadClearCommand(
      { ...target, operation: 'clear-threads', paneKeys: ['working', 'done'] },
      owner,
      threads
    ).targets
  ).toEqual([done])
  expect(many).toHaveBeenCalledExactlyOnceWith([done])
  expect(owner.run).not.toHaveBeenCalled()
})
it('preserves single and multi disabled controls without calling either original parent', () => {
  const threads = [
    { ...thread('working'), currentAgentState: 'working' as const },
    { ...thread('waiting'), currentAgentState: 'waiting' as const }
  ]
  const owner = control(threads)
  expect(
    applyActivityThreadClearCommand(
      { ...target, operation: 'clear-thread', paneKey: 'working' },
      owner,
      threads
    ).targets
  ).toEqual([])
  expect(
    applyActivityThreadClearCommand(
      { ...target, operation: 'clear-threads', paneKeys: ['working', 'waiting'] },
      owner,
      threads
    ).targets
  ).toEqual([])
  expect(single).not.toHaveBeenCalled()
  expect(many).not.toHaveBeenCalled()
})
it('rejects any hidden or unknown target before a partial clear and preserves request order', () => {
  const visible = thread('visible')
  const hidden = thread('hidden')
  const owner = control([visible, hidden])
  expect(() =>
    applyActivityThreadClearCommand(
      { ...target, operation: 'clear-threads', paneKeys: ['visible', 'hidden'] },
      owner,
      [visible]
    )
  ).toThrow('activity_thread_unavailable')
  expect(single).not.toHaveBeenCalled()
  expect(many).not.toHaveBeenCalled()
  applyActivityThreadClearCommand(
    { ...target, operation: 'clear-threads', paneKeys: ['hidden', 'visible'] },
    owner,
    [visible, hidden]
  )
  expect(many).toHaveBeenCalledExactlyOnceWith([hidden, visible])
})
