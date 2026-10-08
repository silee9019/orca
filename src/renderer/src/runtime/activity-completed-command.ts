import type {
  ActivityViewerSurface,
  ActivityViewerCommand
} from '../../../shared/rpc-contract/activity-viewer-params'
import {
  readActivityCompletedControl,
  readActivityThreadReadControl,
  readActivityViewerView
} from './activity-viewer-view'
import {
  isClearableActivityThread,
  clearActivityThread,
  clearCompletedActivity
} from '@/components/activity/activity-clear-completed'
import type { ActivityCompletedControl } from './activity-viewer-view'

export function applyActivityCompletedCommand(control: ActivityCompletedControl): {
  control: ActivityCompletedControl
  targets: ActivityCompletedControl['visibleThreads']
} {
  const targets = control.hasCompletedThreads
    ? control.visibleThreads.filter(isClearableActivityThread)
    : []
  if (targets.length > 0) {
    control.run()
  }
  return { control, targets }
}
export function activityCompletedApplied(
  current: ActivityCompletedControl | null,
  action: ReturnType<typeof applyActivityCompletedCommand>
): boolean {
  return (
    current !== null &&
    current.run === action.control.run &&
    action.targets.every(
      (target) => !current.allThreads.some((thread) => thread.paneKey === target.paneKey)
    )
  )
}

export function readActivityCompletedResult(
  current: ActivityCompletedControl | null,
  action: ReturnType<typeof applyActivityCompletedCommand>
): { paneKeys: string[]; remainingPaneKeys: string[] } {
  const paneKeys = action.targets.map((thread) => thread.paneKey)
  return {
    paneKeys,
    remainingPaneKeys: paneKeys.filter(
      (key) => current?.allThreads.some((thread) => thread.paneKey === key) !== false
    )
  }
}

export function captureActivityCompletedCommand(command: ActivityViewerCommand) {
  const surface = command.surface
  const control = readActivityCompletedControl(surface)
  if (!control) {
    throw new Error('activity_completed_control_unavailable')
  }
  const query = readActivityViewerView(surface)?.query
  if (command.operation === 'clear-completed') {
    return { ...applyActivityCompletedCommand(control), query }
  }
  if (command.operation !== 'clear-thread' && command.operation !== 'clear-threads') {
    throw new Error('invalid_activity_clear_operation')
  }
  const visible = readActivityThreadReadControl(surface)?.visibleThreads
  if (!visible) {
    throw new Error('activity_clear_control_unavailable')
  }
  return { ...applyActivityThreadClearCommand(command, control, visible), query }
}

export function activityCompletedStillExpected(
  surface: ActivityViewerSurface,
  action: ReturnType<typeof captureActivityCompletedCommand>
): boolean {
  return (
    readActivityCompletedControl(surface)?.run === action.control.run &&
    readActivityViewerView(surface)?.query === action.query
  )
}

export function applyActivityThreadClearCommand(
  command: Extract<ActivityViewerCommand, { operation: 'clear-thread' | 'clear-threads' }>,
  control: ActivityCompletedControl,
  visible: ActivityCompletedControl['visibleThreads']
): ReturnType<typeof applyActivityCompletedCommand> {
  const keys = command.operation === 'clear-thread' ? [command.paneKey] : command.paneKeys
  const requested = keys.map((key) => {
    const thread = visible.find((candidate) => candidate.paneKey === key)
    if (!thread) {
      throw new Error('activity_thread_unavailable')
    }
    return thread
  })
  const targets = requested.filter(isClearableActivityThread)
  if (targets.length === 0) {
    return { control, targets }
  }
  const dispatched =
    command.operation === 'clear-thread'
      ? clearActivityThread(targets[0])
      : clearCompletedActivity(targets)
  return { control, targets: dispatched ? targets : [] }
}
