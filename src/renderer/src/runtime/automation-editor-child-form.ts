import { applyAutomationText } from './automation-text-viewer'
import { applyAutomationDestination } from './automation-destination-viewer'
import type { AutomationEditorViewerAction } from '../../../shared/automation-editor-viewer-command'
import { applyAutomationSetupViewerAction } from './automation-setup-viewer-controller'
import { applyAutomationWorkspaceViewerAction } from './automation-workspace-viewer-controller'
import { applyAutomationTimeViewerAction } from './automation-time-viewer-controller'
import { applyAutomationProjectViewerAction } from './automation-project-viewer-controller'

type Child = Extract<
  AutomationEditorViewerAction,
  {
    kind:
      | 'text-form'
      | 'destination-form'
      | 'time-form'
      | 'workspace-form'
      | 'setup-form'
      | 'project-form'
  }
>
export async function applyAutomationEditorChildForm(action: Child) {
  switch (action.kind) {
    case 'text-form':
      return { text: await applyAutomationText(action.action) }
    case 'destination-form':
      return { destination: await applyAutomationDestination(action.action) }
    case 'time-form':
      return { time: await applyAutomationTimeViewerAction(action.action) }
    case 'workspace-form':
      return { workspace: await applyAutomationWorkspaceViewerAction(action.action) }
    case 'setup-form':
      return { setup: await applyAutomationSetupViewerAction(action.action) }
    case 'project-form':
      return { project: await applyAutomationProjectViewerAction(action.action) }
  }
}
