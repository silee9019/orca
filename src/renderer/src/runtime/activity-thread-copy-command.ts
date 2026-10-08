import { captureActivityPreviewIssueCopyTarget } from './activity-preview-issue-copy-target'
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
  command: Extract<
    ActivityViewerCommand,
    { operation: 'copy' | 'preview-copy-path' | 'preview-copy-issue-link' }
  >
): Promise<Omit<ActivityViewerResult, 'viewerId'>> {
  const context = captureActivityThreadCommandTarget(command.surface, command.paneKey)
  const { initial, thread, control, sameRuntime, observe } = context
  const issue =
    command.operation === 'preview-copy-issue-link'
      ? captureActivityPreviewIssueCopyTarget(context)
      : null
  const preview =
    command.operation === 'preview-copy-path' ? captureActivityPreviewCopyTarget(context) : null
  const kind = issue ? 'issue-link' : command.operation === 'copy' ? command.kind : 'path'
  const target =
    issue?.target ??
    preview?.target ??
    getActivityThreadCopyTargets(thread, control.canJump(thread)).find(
      (candidate) => candidate.key === kind
    )
  if (!target) {
    throw new Error('activity_copy_unavailable')
  }
  const value = target.value
  const stillExpected = (): boolean => {
    if (issue) {
      return context.stillExpected() && issue.closed()
    }
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
      issue
        ? issue.copy()
        : preview
          ? copyActivityThreadPreviewPath(value)
          : writeActivityThreadCopyTarget(target).then(() => true),
      remaining(),
      false
    )
    const issueClosed = !issue || (written && (await issue.waitForClose(remaining())))
    observe()
    const verified =
      written &&
      issueClosed &&
      Date.now() < request.expiresAt &&
      stillExpected() &&
      (await withTimeout(
        window.api.ui.readClipboardText().then((text) => text === value),
        remaining(),
        false
      ))
    observe()
    const available = issue ? issue.available() && context.stillExpected() : stillExpected()
    const stillClosed = !issue || issue.closed()
    return {
      viewer: 'host',
      surface: command.surface,
      dispatched: true,
      applied:
        Date.now() < request.expiresAt && available && issueClosed && stillClosed && verified,
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
          : !verified || !stillClosed || Date.now() >= request.expiresAt
            ? { reason: 'viewer_not_applied' as const }
            : {})
    }
  } finally {
    unsubscribe()
    preview?.dispose()
    issue?.dispose()
  }
}
