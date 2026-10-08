import type { AutomationDraft } from './AutomationEditorDialog'
import type { AutomationWorkspaceMode } from '../../../../shared/automations-types'

export function setAutomationWorkspaceModeDraft(
  current: AutomationDraft,
  workspaceMode: AutomationWorkspaceMode
): AutomationDraft {
  return {
    ...current,
    workspaceMode,
    reuseSession: workspaceMode === 'existing' ? current.reuseSession : false
  }
}
export function setAutomationWorkspaceDraft(
  current: AutomationDraft,
  workspaceId: string
): AutomationDraft {
  return { ...current, workspaceId }
}
