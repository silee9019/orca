import {
  AutomationViewerActionSchema,
  type AutomationViewerAction
} from '../../../shared/automation-viewer-command'
import { applyAutomationViewerAction } from './automation-viewer-controller'
import { applyWorkspaceAutomation } from './workspace-automation-viewer'

export async function applyAutomationViewerRequest(action: AutomationViewerAction) {
  const parsed = AutomationViewerActionSchema.parse(action)
  if (parsed.kind === 'workspace-provenance-form') {
    return applyWorkspaceAutomation(parsed.action)
  }
  return applyAutomationViewerAction(parsed)
}
