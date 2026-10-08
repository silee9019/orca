import {
  applyAutomationSetupViewerAction,
  type AutomationSetupViewerState
} from './automation-setup-viewer-controller'
import type { TuiAgent } from '../../../shared/tui-agent'
import {
  applyAutomationWorkspaceViewerAction,
  type AutomationWorkspaceViewerState
} from './automation-workspace-viewer-controller'
import {
  applyAutomationTimeViewerAction,
  type AutomationTimeViewerState
} from './automation-time-viewer-controller'
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
import type {
  AutomationCreateTarget,
  AutomationDraft
} from '../components/automations/AutomationEditorDialog'
import type { AutomationTemplate } from '../components/automations/automation-templates'

type Form = {
  open: boolean
  reviewedTarget: string
  isSaving: boolean
  draft: AutomationDraft
  isCreateMode: boolean
  createTarget: AutomationCreateTarget
  templateOpen: boolean
  templates: readonly AutomationTemplate[]
  agentIds: readonly TuiAgent[]
  projectIds: readonly string[]
  onProjectChange: (projectId: string) => void
  onTemplateOpenChange: (open: boolean) => void
  onApplyTemplate: (template: AutomationTemplate) => void
  onCreateTargetChange: (target: AutomationCreateTarget) => void
  onDraftChange: (updater: (draft: AutomationDraft) => AutomationDraft) => void
  onOpenChange: (open: boolean) => void
}
function snapshot(form: Form) {
  return {
    viewer: 'desktop' as const,
    committed: true as const,
    open: form.open,
    reviewedTarget: form.reviewedTarget,
    isSaving: form.isSaving,
    name: form.draft.name,
    prompt: form.draft.prompt,
    draft: form.draft,
    createTarget: form.createTarget,
    projectIds: form.projectIds,
    agentIds: form.createTarget === 'hermes' ? [] : form.agentIds,
    templateOpen: form.templateOpen,
    templates: form.isCreateMode ? form.templates : []
  }
}
export type AutomationEditorViewerState = ReturnType<typeof snapshot> & {
  time?: AutomationTimeViewerState
  workspace?: AutomationWorkspaceViewerState
  setup?: AutomationSetupViewerState
}
type Control = (action: AutomationEditorViewerAction) => Promise<AutomationEditorViewerState>
const mountedEditors = new Set<Control>()
export async function applyAutomationEditorViewerAction(
  action: AutomationEditorViewerAction
): Promise<AutomationEditorViewerState> {
  const parsed = AutomationEditorViewerActionSchema.parse(action)
  if (mountedEditors.size !== 1) {
    throw new Error(mountedEditors.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedEditors.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function useAutomationEditorViewerController(form: Omit<Form, 'reviewedTarget'>): void {
  const target = useRef({ open: form.open, token: createBrowserUuid() })
  const latest = useRef<Form>({ ...form, reviewedTarget: target.current.token })
  const [, setRevision] = useState(0)
  const childBusy = useRef(false)
  const pending = useRef<{
    action: Exclude<
      AutomationEditorViewerAction,
      { kind: 'get' | 'time-form' | 'workspace-form' | 'setup-form' }
    >
    resolve: (state: AutomationEditorViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  useLayoutEffect(() => {
    if (target.current.open !== form.open) {
      target.current = { open: form.open, token: createBrowserUuid() }
    }
    const current = { ...form, reviewedTarget: target.current.token }
    latest.current = current
    const request = pending.current
    if (!request) {
      return
    }
    const action = request.action
    if (action.kind === 'close') {
      if (!form.open) {
        pending.current = null
        request.resolve(snapshot(current))
      } else if (current.reviewedTarget !== action.reviewedTarget) {
        pending.current = null
        request.reject(new Error('viewer_target_changed'))
      }
      return
    }
    pending.current = null
    if (
      !form.open ||
      current.reviewedTarget !== action.reviewedTarget ||
      (action.kind === 'project' && form.draft.projectId !== action.projectId) ||
      (action.kind === 'agent' && form.draft.agentId !== action.value) ||
      ((action.kind === 'name' || action.kind === 'prompt') &&
        form.draft[action.kind] !== action.value) ||
      (action.kind === 'session' &&
        (form.draft.reuseSession !== (action.value === 'reuse') ||
          (action.value === 'reuse' && form.draft.workspaceMode !== 'existing'))) ||
      (action.kind === 'missed-run-grace' && form.draft.missedRunGraceMinutes !== action.value) ||
      (action.kind === 'precheck-command' && form.draft.precheckCommand !== action.value) ||
      (action.kind === 'precheck-timeout' && form.draft.precheckTimeoutSeconds !== action.value) ||
      (action.kind === 'schedule-preset' &&
        (form.draft.preset !== action.value || form.draft.scheduleWarning !== null)) ||
      (action.kind === 'schedule-weekday' &&
        (form.draft.dayOfWeek !== action.value || form.draft.scheduleWarning !== null)) ||
      (action.kind === 'schedule-cron' &&
        (form.draft.customSchedule !== action.value || form.draft.scheduleWarning !== null)) ||
      (action.kind === 'template-open' && form.templateOpen !== action.value) ||
      (action.kind === 'create-target' && form.createTarget !== action.value) ||
      (action.kind === 'template-apply' &&
        (form.templateOpen ||
          form.draft.name !==
            form.templates.find((template) => template.id === action.templateId)?.name ||
          form.draft.prompt !==
            form.templates.find((template) => template.id === action.templateId)?.prompt))
    ) {
      request.reject(new Error('viewer_target_changed'))
    } else {
      request.resolve(snapshot(current))
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
      if (
        action.kind === 'time-form' ||
        action.kind === 'workspace-form' ||
        action.kind === 'setup-form'
      ) {
        if (action.kind === 'time-form' && current.draft.preset === 'custom') {
          throw new Error('automation_time_unavailable')
        }
        childBusy.current = true
        try {
          const state =
            action.kind === 'time-form'
              ? { time: await applyAutomationTimeViewerAction(action.action) }
              : action.kind === 'workspace-form'
                ? { workspace: await applyAutomationWorkspaceViewerAction(action.action) }
                : { setup: await applyAutomationSetupViewerAction(action.action) }
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
        pending.current = { action, resolve, reject }
        if (action.kind === 'close') {
          current.onOpenChange(false)
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
    mountedEditors.add(control)
    return () => {
      mountedEditors.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [form.open])
}
