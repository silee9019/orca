import { captureActivityPreviewCopyTarget } from './activity-preview-copy-target'
import { useAppStore } from '@/store'
import {
  copyActivityThreadPreviewPath,
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
  command: Extract<ActivityViewerCommand, { operation: 'copy' | 'preview-copy-path' }>
): Promise<Omit<ActivityViewerResult, 'viewerId'>> {
  const context = captureActivityThreadCommandTarget(command.surface, command.paneKey)
  const { initial, thread, control, sameRuntime, observe } = context
  const preview =
    command.operation === 'preview-copy-path' ? captureActivityPreviewCopyTarget(context) : null
  const kind = command.operation === 'copy' ? command.kind : 'path'
  const target =
    preview?.target ??
    getActivityThreadCopyTargets(thread, control.canJump(thread)).find(
      (candidate) => candidate.key === kind
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
      (preview
        ? preview.stillExpected() && current.thread.worktree.path === value
        : getActivityThreadCopyTargets(
            current.thread,
            current.control.canJump(current.thread)
          ).some((candidate) => candidate.key === kind && candidate.value === value))
    )
  }
  const unsubscribe = useAppStore.subscribe(observe)
  try {
    const remaining = (): number => Math.max(0, Math.min(5000, request.expiresAt - Date.now()))
    const written = await withTimeout(
      preview
        ? copyActivityThreadPreviewPath(value)
        : writeActivityThreadCopyTarget(target).then(() => true),
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
        kind,
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
    preview?.dispose()
  }
}
