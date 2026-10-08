import { automationTextSnapshot } from './automation-text-viewer'
import { automationDestinationSnapshot } from './automation-destination-viewer'
import type { AutomationHostRecoveryAction } from '../components/automations/automation-host-status-descriptors'
import { automationProjectViewerSnapshot } from './automation-project-viewer-controller'
import type { AutomationActionNotice } from '../components/automations/automation-row-action-dispatch'
import type { TuiAgent } from '../../../shared/tui-agent'
import type {
  AutomationCreateTarget,
  AutomationDraft
} from '../components/automations/AutomationEditorDialog'
import type { AutomationTemplate } from '../components/automations/automation-templates'
import type { AutomationTimeViewerState } from './automation-time-viewer-controller'
import type { AutomationWorkspaceViewerState } from './automation-workspace-viewer-controller'
import type { AutomationSetupViewerState } from './automation-setup-viewer-controller'
export type AutomationEditorViewerForm = {
  open: boolean
  reviewedTarget: string
  noticeReviewedTarget: string
  notice?: AutomationActionNotice | null
  noticeOwnerKey?: string
  onNoticeDismiss?: () => void
  onNoticeRecover?: (action: AutomationHostRecoveryAction) => void
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
export function automationEditorViewerSnapshot(form: AutomationEditorViewerForm) {
  return {
    viewer: 'desktop' as const,
    committed: true as const,
    open: form.open,
    reviewedTarget: form.reviewedTarget,
    isSaving: form.isSaving,
    notice: {
      reviewedTarget: form.noticeReviewedTarget,
      value: form.notice ?? null,
      canDismiss: Boolean(form.notice && form.onNoticeDismiss),
      canRecover: Boolean(form.notice?.recovery && form.onNoticeRecover)
    },
    name: form.draft.name,
    prompt: form.draft.prompt,
    draft: form.draft,
    createTarget: form.createTarget,
    projectIds: form.projectIds,
    project: automationProjectViewerSnapshot(),
    destination: automationDestinationSnapshot(),
    text: automationTextSnapshot(),
    agentIds: form.createTarget === 'hermes' ? [] : form.agentIds,
    templateOpen: form.templateOpen,
    templates: form.isCreateMode ? form.templates : []
  }
}
export type AutomationEditorViewerState = ReturnType<typeof automationEditorViewerSnapshot> & {
  noticeRecovery?: { requested: AutomationHostRecoveryAction; reviewStatus: 'current' | 'changed' }
  time?: AutomationTimeViewerState
  workspace?: AutomationWorkspaceViewerState
  setup?: AutomationSetupViewerState
}
