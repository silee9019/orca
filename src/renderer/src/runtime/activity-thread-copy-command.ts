import { useAppStore } from '@/store'
import {
  getActivityThreadCopyTargets,
  writeActivityThreadCopyTarget
} from '@/components/activity/activity-thread-copy'
import type {
  ActivityViewerRequest,
  ActivityViewerResult
} from '../../../shared/activity-viewer-command'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'
import { withTimeout } from '../../../shared/promise-timeout-fallback'
import { readActivityViewerView } from './activity-viewer-view'
import { captureActivityThreadCommandTarget } from './activity-thread-command-target'

export async function applyActivityThreadCopyRequest(
  request: ActivityViewerRequest,
  command: Extract<ActivityViewerCommand, { operation: 'copy' }>
): Promise<Omit<ActivityViewerResult, 'viewerId'>> {
  const context = captureActivityThreadCommandTarget(command.surface, command.paneKey)
  const { initial, thread, control, sameRuntime, observe } = context
  const target = getActivityThreadCopyTargets(thread, control.canJump(thread)).find(
    (candidate) => candidate.key === command.kind
  )
  if (!target) {
    throw new Error('activity_copy_unavailable')
  }
  const value = target.value
  const stillExpected = (): boolean => {
    const current = context.readCurrent()
    return (
      context.stillExpected() &&
      current !== null &&
      getActivityThreadCopyTargets(current.thread, current.control.canJump(current.thread)).some(
        (candidate) => candidate.key === command.kind && candidate.value === value
      )
    )
  }
  const unsubscribe = useAppStore.subscribe(observe)
  try {
    const remaining = (): number => Math.max(0, Math.min(5000, request.expiresAt - Date.now()))
    const written = await withTimeout(
      writeActivityThreadCopyTarget(target).then(() => true),
      remaining(),
      false
    )
    observe()
    const verified =
      written &&
      Date.now() < request.expiresAt &&
      stillExpected() &&
      (await withTimeout(
        window.api.ui.readClipboardText().then((text) => text === value),
        remaining(),
        false
      ))
    observe()
    const available = stillExpected()
    return {
      viewer: 'host',
      surface: command.surface,
      dispatched: true,
      applied: Date.now() < request.expiresAt && available && verified,
      persisted: null,
      writeOutcome: 'not_requested',
      groupBy: initial.agentsGroupBy,
      readFilter: initial.agentsReadFilter,
      compact: initial.agentsCompactMode,
      showChildAgents: initial.agentsShowChildAgents,
      rendered: sameRuntime() ? readActivityViewerView(command.surface) : null,
      copyAction: {
        paneKey: command.paneKey,
        kind: command.kind,
        writeAcknowledged: written,
        verified
      },
      ...(!sameRuntime()
        ? { reason: 'viewer_runtime_changed' as const }
        : !available
          ? { reason: 'viewer_surface_superseded' as const }
          : !verified || Date.now() >= request.expiresAt
            ? { reason: 'viewer_not_applied' as const }
            : {})
    }
  } finally {
    unsubscribe()
  }
}
