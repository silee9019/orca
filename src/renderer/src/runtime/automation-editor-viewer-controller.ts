import {
  completeAutomationEditorRequest,
  type AutomationEditorPendingRequest
} from './automation-editor-request-completion'
import { useAppStore } from '@/store'
import { applyAutomationEditorChildForm } from './automation-editor-child-form'
import {
  setAutomationSchedulePresetDraft,
  setAutomationScheduleWeekdayDraft,
  setAutomationCustomCronDraft
} from '../components/automations/automation-schedule-draft'
import {
  setAutomationAgentDraft,
  setAutomationSessionDraft,
  setAutomationGraceDraft,
  setAutomationPrecheckCommandDraft,
  setAutomationPrecheckTimeoutDraft
} from '../components/automations/automation-editor-field-draft'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  AutomationEditorViewerActionSchema,
  type AutomationEditorViewerAction
} from '../../../shared/automation-editor-viewer-command'
import {
  automationEditorViewerSnapshot as snapshot,
  type AutomationEditorViewerForm as Form,
  type AutomationEditorViewerState
} from './automation-editor-viewer-state'
export type { AutomationEditorViewerState } from './automation-editor-viewer-state'

type Control = (action: AutomationEditorViewerAction) => Promise<AutomationEditorViewerState>
const mountedEditors = new Map<Control, () => boolean>()
export function isAutomationEditorViewerBusy(): boolean {
  return [...mountedEditors.values()].some((getBusy) => getBusy())
}
export async function applyAutomationEditorViewerAction(
  action: AutomationEditorViewerAction
): Promise<AutomationEditorViewerState> {
  const parsed = AutomationEditorViewerActionSchema.parse(action)
  if (mountedEditors.size !== 1) {
    throw new Error(mountedEditors.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedEditors.keys().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function useAutomationEditorViewerController(
  form: Omit<Form, 'reviewedTarget' | 'noticeReviewedTarget'>
): void {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const target = useRef({ open: form.open, token: createBrowserUuid() })
  const noticeTarget = useRef({
    profile,
    notice: form.notice,
    owner: form.noticeOwnerKey,
    open: form.open,
    token: createBrowserUuid()
  })
  const latest = useRef<Form>({
    ...form,
    reviewedTarget: target.current.token,
    noticeReviewedTarget: noticeTarget.current.token
  })
  const [, setRevision] = useState(0)
  const childBusy = useRef(false)
  const pending = useRef<AutomationEditorPendingRequest | null>(null)
  useLayoutEffect(() => {
    if (target.current.open !== form.open) {
      target.current = { open: form.open, token: createBrowserUuid() }
    }
    if (
      noticeTarget.current.profile !== profile ||
      noticeTarget.current.notice !== form.notice ||
      noticeTarget.current.owner !== form.noticeOwnerKey ||
      noticeTarget.current.open !== form.open
    ) {
      noticeTarget.current = {
        profile,
        notice: form.notice,
        owner: form.noticeOwnerKey,
        open: form.open,
        token: createBrowserUuid()
      }
    }
    const current = {
      ...form,
      reviewedTarget: target.current.token,
      noticeReviewedTarget: noticeTarget.current.token
    }
    latest.current = current
    const request = pending.current
    if (!request) {
      return
    }
    if (completeAutomationEditorRequest(current, request, profile)) {
      pending.current = null
    }
  })
  useEffect(() => {
    if (!form.open) {
      return
    }
    const control: Control = async (action) => {
      const current = latest.current
      if (!current.open) {
        throw new Error('viewer_unavailable')
      }
      if (action.kind === 'get') {
        return snapshot(current)
      }
      if (pending.current || childBusy.current) {
        throw new Error('viewer_busy')
      }
      if (action.reviewedTarget !== current.reviewedTarget) {
        throw new Error('viewer_target_changed')
      }
      if (action.kind === 'notice-dismiss' || action.kind === 'notice-recover') {
        if (action.reviewedNotice !== current.noticeReviewedTarget) {
          throw new Error('viewer_target_changed')
        }
        if (
          !current.notice ||
          (action.kind === 'notice-dismiss'
            ? !current.onNoticeDismiss
            : !current.onNoticeRecover || current.notice.recovery !== action.action)
        ) {
          throw new Error('automation_notice_unavailable')
        }
      }
      if (
        action.kind === 'text-form' ||
        action.kind === 'destination-form' ||
        action.kind === 'time-form' ||
        action.kind === 'workspace-form' ||
        action.kind === 'setup-form' ||
        action.kind === 'project-form'
      ) {
        if (action.kind === 'time-form' && current.draft.preset === 'custom') {
          throw new Error('automation_time_unavailable')
        }
        childBusy.current = true
        try {
          const state = await applyAutomationEditorChildForm(action)
          if (!latest.current.open || latest.current.reviewedTarget !== action.reviewedTarget) {
            throw new Error('viewer_target_changed')
          }
          return { ...snapshot(latest.current), ...state }
        } finally {
          childBusy.current = false
        }
      }
      if (
        (action.kind === 'template-open' ||
          action.kind === 'template-apply' ||
          action.kind === 'create-target') &&
        !current.isCreateMode
      ) {
        throw new Error('automation_editor_control_unavailable')
      }
      if (
        current.createTarget === 'hermes' &&
        (action.kind === 'agent' ||
          action.kind === 'session' ||
          action.kind === 'missed-run-grace' ||
          (current.isCreateMode &&
            (action.kind === 'precheck-command' || action.kind === 'precheck-timeout')))
      ) {
        throw new Error('automation_editor_control_unavailable')
      }
      if (
        (action.kind === 'schedule-weekday' && current.draft.preset !== 'weekly') ||
        (action.kind === 'schedule-cron' && current.draft.preset !== 'custom')
      ) {
        throw new Error('automation_editor_control_unavailable')
      }
      if (action.kind === 'project' && !current.projectIds.includes(action.projectId)) {
        throw new Error('automation_project_unavailable')
      }
      const selectedAgent =
        action.kind === 'agent' ? current.agentIds.find((id) => id === action.value) : null
      if (action.kind === 'agent' && !selectedAgent) {
        throw new Error('automation_agent_unavailable')
      }
      const template =
        action.kind === 'template-apply'
          ? current.templates.find((entry) => entry.id === action.templateId)
          : null
      if (action.kind === 'template-apply' && (!current.templateOpen || !template)) {
        throw new Error('automation_template_unavailable')
      }
      return new Promise((resolve, reject) => {
        pending.current = {
          action,
          resolve,
          reject,
          noticeOwnerKey: current.noticeOwnerKey,
          noticeProfile: noticeTarget.current.profile
        }
        if (action.kind === 'close') {
          current.onOpenChange(false)
        } else if (action.kind === 'notice-recover') {
          try {
            current.onNoticeRecover?.(action.action)
          } catch (error) {
            pending.current = null
            reject(error instanceof Error ? error : new Error('automation_notice_recovery_failed'))
            return
          }
        } else if (action.kind === 'notice-dismiss') {
          current.onNoticeDismiss?.()
        } else if (action.kind === 'project') {
          current.onProjectChange(action.projectId)
        } else if (action.kind === 'name') {
          current.onDraftChange((draft) => ({ ...draft, name: action.value }))
        } else if (action.kind === 'prompt') {
          current.onDraftChange((draft) => ({ ...draft, prompt: action.value }))
        } else if (action.kind === 'agent' && selectedAgent) {
          current.onDraftChange((draft) => setAutomationAgentDraft(draft, selectedAgent))
        } else if (action.kind === 'session') {
          current.onDraftChange((draft) => setAutomationSessionDraft(draft, action.value))
        } else if (action.kind === 'missed-run-grace') {
          current.onDraftChange((draft) => setAutomationGraceDraft(draft, action.value))
        } else if (action.kind === 'precheck-command') {
          current.onDraftChange((draft) => setAutomationPrecheckCommandDraft(draft, action.value))
        } else if (action.kind === 'precheck-timeout') {
          current.onDraftChange((draft) => setAutomationPrecheckTimeoutDraft(draft, action.value))
        } else if (action.kind === 'schedule-preset') {
          current.onDraftChange((draft) => setAutomationSchedulePresetDraft(draft, action.value))
        } else if (action.kind === 'schedule-weekday') {
          current.onDraftChange((draft) => setAutomationScheduleWeekdayDraft(draft, action.value))
        } else if (action.kind === 'schedule-cron') {
          current.onDraftChange((draft) => setAutomationCustomCronDraft(draft, action.value))
        } else if (action.kind === 'template-open') {
          current.onTemplateOpenChange(action.value)
        } else if (action.kind === 'create-target') {
          current.onCreateTargetChange(action.value)
        } else if (template) {
          current.onApplyTemplate(template)
        }
        setRevision((value) => value + 1)
      })
    }
    mountedEditors.set(control, () => Boolean(pending.current || childBusy.current))
    return () => {
      mountedEditors.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [form.open])
}
