import type { ActivityViewerSurface } from '../../../shared/rpc-contract/activity-viewer-params'
import { readActivityCompletedControl, readActivityViewerView } from './activity-viewer-view'
import { isClearableActivityThread } from '@/components/activity/activity-clear-completed'
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

export function captureActivityCompletedCommand(surface: ActivityViewerSurface) {
  const control = readActivityCompletedControl(surface)
  if (!control) {
    throw new Error('activity_completed_control_unavailable')
  }
  const query = readActivityViewerView(surface)?.query
  return { ...applyActivityCompletedCommand(control), query }
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
