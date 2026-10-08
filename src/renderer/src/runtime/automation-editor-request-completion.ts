import type { AutomationEditorViewerAction } from '../../../shared/automation-editor-viewer-command'
import {
  automationEditorViewerSnapshot as snapshot,
  type AutomationEditorViewerForm as Form,
  type AutomationEditorViewerState
} from './automation-editor-viewer-state'

export type AutomationEditorPendingRequest = {
  action: Exclude<
    AutomationEditorViewerAction,
    {
      kind:
        | 'get'
        | 'text-form'
        | 'destination-form'
        | 'time-form'
        | 'workspace-form'
        | 'setup-form'
        | 'project-form'
    }
  >
  noticeOwnerKey?: string
  noticeProfile: string | null
  resolve: (state: AutomationEditorViewerState) => void
  reject: (error: Error) => void
}

export function completeAutomationEditorRequest(
  current: Form,
  request: AutomationEditorPendingRequest,
  profile: string | null
): boolean {
  const action = request.action
  if (action.kind === 'notice-recover') {
    if (!current.notice) {
      request.resolve({
        ...snapshot(current),
        noticeRecovery: {
          requested: action.action,
          reviewStatus:
            request.noticeOwnerKey === current.noticeOwnerKey && request.noticeProfile === profile
              ? 'current'
              : 'changed'
        }
      })
    } else if (
      !current.open ||
      current.reviewedTarget !== action.reviewedTarget ||
      request.noticeOwnerKey !== current.noticeOwnerKey ||
      request.noticeProfile !== profile ||
      current.noticeReviewedTarget !== action.reviewedNotice
    ) {
      request.reject(new Error('viewer_target_changed'))
    }
    return (
      !current.notice ||
      !current.open ||
      current.reviewedTarget !== action.reviewedTarget ||
      request.noticeOwnerKey !== current.noticeOwnerKey ||
      request.noticeProfile !== profile ||
      current.noticeReviewedTarget !== action.reviewedNotice
    )
  }
  if (action.kind === 'notice-dismiss') {
    if (
      !current.open ||
      current.reviewedTarget !== action.reviewedTarget ||
      request.noticeProfile !== profile ||
      request.noticeOwnerKey !== current.noticeOwnerKey ||
      (current.notice && current.noticeReviewedTarget !== action.reviewedNotice)
    ) {
      request.reject(new Error('viewer_target_changed'))
    } else if (!current.notice) {
      request.resolve(snapshot(current))
    }
    return (
      !current.notice ||
      !current.open ||
      current.reviewedTarget !== action.reviewedTarget ||
      request.noticeProfile !== profile ||
      request.noticeOwnerKey !== current.noticeOwnerKey ||
      current.noticeReviewedTarget !== action.reviewedNotice
    )
  }
  if (action.kind === 'close') {
    if (!current.open) {
      request.resolve(snapshot(current))
    } else if (current.reviewedTarget !== action.reviewedTarget) {
      request.reject(new Error('viewer_target_changed'))
    }
    return !current.open || current.reviewedTarget !== action.reviewedTarget
  }
  if (
    !current.open ||
    current.reviewedTarget !== action.reviewedTarget ||
    (action.kind === 'project' && current.draft.projectId !== action.projectId) ||
    (action.kind === 'agent' && current.draft.agentId !== action.value) ||
    ((action.kind === 'name' || action.kind === 'prompt') &&
      current.draft[action.kind] !== action.value) ||
    (action.kind === 'session' &&
      (current.draft.reuseSession !== (action.value === 'reuse') ||
        (action.value === 'reuse' && current.draft.workspaceMode !== 'existing'))) ||
    (action.kind === 'missed-run-grace' && current.draft.missedRunGraceMinutes !== action.value) ||
    (action.kind === 'precheck-command' && current.draft.precheckCommand !== action.value) ||
    (action.kind === 'precheck-timeout' && current.draft.precheckTimeoutSeconds !== action.value) ||
    (action.kind === 'schedule-preset' &&
      (current.draft.preset !== action.value || current.draft.scheduleWarning !== null)) ||
    (action.kind === 'schedule-weekday' &&
      (current.draft.dayOfWeek !== action.value || current.draft.scheduleWarning !== null)) ||
    (action.kind === 'schedule-cron' &&
      (current.draft.customSchedule !== action.value || current.draft.scheduleWarning !== null)) ||
    (action.kind === 'template-open' && current.templateOpen !== action.value) ||
    (action.kind === 'create-target' && current.createTarget !== action.value) ||
    (action.kind === 'template-apply' &&
      (current.templateOpen ||
        current.draft.name !==
          current.templates.find((template) => template.id === action.templateId)?.name ||
        current.draft.prompt !==
          current.templates.find((template) => template.id === action.templateId)?.prompt))
  ) {
    request.reject(new Error('viewer_target_changed'))
  } else {
    request.resolve(snapshot(current))
  }
  return true
}
