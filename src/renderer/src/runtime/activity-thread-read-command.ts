import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
import { getActivityThreadReadTargets } from '@/components/activity/activity-thread-read-targets'
import type { ActivityThreadReadControl } from './activity-viewer-view'

type ReadCommand = Extract<ActivityViewerCommand, { operation: 'read-toggle' | 'read-toggle-many' }>
export type ActivityThreadReadAction = {
  operation: 'read' | 'unread'
  targets: readonly AgentPaneThread[]
  control: ActivityThreadReadControl
}
export function applyActivityThreadReadCommand(
  command: ReadCommand,
  control: ActivityThreadReadControl
): ActivityThreadReadAction {
  const keys = command.operation === 'read-toggle' ? [command.paneKey] : command.paneKeys
  const targets = keys.map((key) => {
    const thread = control.visibleThreads.find((thread) => thread.paneKey === key)
    if (!thread) {
      throw new Error('activity_thread_unavailable')
    }
    return thread
  })
  const action = getActivityThreadReadTargets(targets, control.canMarkUnread)
  if (action.targets.length > 0) {
    if (command.operation === 'read-toggle') {
      if (action.operation === 'read') {
        control.markRead(action.targets[0])
      } else {
        control.markUnread(action.targets[0])
      }
    } else if (action.operation === 'read') {
      control.markManyRead(action.targets)
    } else {
      control.markManyUnread(action.targets)
    }
  }
  return { ...action, control }
}
export function sameActivityThreadReadCallbacks(
  current: ActivityThreadReadControl | null,
  expected: ActivityThreadReadControl
): boolean {
  return (
    current !== null &&
    current.markRead === expected.markRead &&
    current.markUnread === expected.markUnread &&
    current.markManyRead === expected.markManyRead &&
    current.markManyUnread === expected.markManyUnread &&
    current.canMarkUnread === expected.canMarkUnread
  )
}
export function activityThreadReadApplied(
  current: ActivityThreadReadControl | null,
  action: ActivityThreadReadAction
): boolean {
  return (
    sameActivityThreadReadCallbacks(current, action.control) &&
    action.targets.every((before) => {
      const after = current?.allThreads.find((thread) => thread.paneKey === before.paneKey)
      return (
        after !== undefined &&
        after.latestTimestamp === before.latestTimestamp &&
        after.paneEntry?.stateStartedAt === before.paneEntry?.stateStartedAt &&
        after.unread === (action.operation === 'unread')
      )
    })
  )
}
export function readActivityThreadReadStates(
  current: ActivityThreadReadControl | null,
  action: ActivityThreadReadAction
): { paneKey: string; unread: boolean | null }[] {
  return action.targets.map((thread) => ({
    paneKey: thread.paneKey,
    unread:
      current?.allThreads.find((candidate) => candidate.paneKey === thread.paneKey)?.unread ?? null
  }))
}
