import type { TuiAgent } from '../../../../shared/tui-agent'
import type { AutomationDraft } from './AutomationEditorDialog'

export function setAutomationSessionDraft(
  current: AutomationDraft,
  value: string
): AutomationDraft {
  return {
    ...current,
    reuseSession: value === 'reuse',
    workspaceMode: value === 'reuse' ? 'existing' : current.workspaceMode
  }
}
export function setAutomationGraceDraft(
  current: AutomationDraft,
  missedRunGraceMinutes: string
): AutomationDraft {
  return { ...current, missedRunGraceMinutes }
}
export function setAutomationPrecheckCommandDraft(
  current: AutomationDraft,
  precheckCommand: string
): AutomationDraft {
  return { ...current, precheckCommand }
}
export function setAutomationPrecheckTimeoutDraft(
  current: AutomationDraft,
  precheckTimeoutSeconds: string
): AutomationDraft {
  return { ...current, precheckTimeoutSeconds }
}

export function setAutomationAgentDraft(
  current: AutomationDraft,
  agentId: TuiAgent
): AutomationDraft {
  return { ...current, agentId }
}
