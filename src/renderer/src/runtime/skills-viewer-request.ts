import { applyLinearAccess } from './linear-access-viewer'
import { applyLinearSkillPrompt } from './linear-skill-prompt-viewer'
import { applyOrchestrationCommandDialog } from './orchestration-command-dialog-viewer'
import { applyAgentSkillSetup } from './agent-skill-setup-viewer'
import {
  SkillsViewerActionSchema,
  type SkillsViewerAction
} from '../../../shared/skills-viewer-command'
import { applySkillFreshnessViewerAction } from './skill-freshness-viewer-controller'
import { applySkillsViewerAction } from './skills-viewer-controller'

export async function applySkillsViewerRequest(action: SkillsViewerAction) {
  const parsed = SkillsViewerActionSchema.parse(action)
  if (parsed.kind === 'linear-access-form') {
    return applyLinearAccess(parsed.action)
  }
  if (parsed.kind === 'linear-prompt-form') {
    return applyLinearSkillPrompt(parsed.action)
  }
  if (parsed.kind === 'command-dialog-form') {
    return applyOrchestrationCommandDialog(parsed.action)
  }
  if (parsed.kind === 'setup-form') {
    return applyAgentSkillSetup(parsed.action)
  }
  if (parsed.kind === 'freshness-form') {
    try {
      await applySkillsViewerAction({ kind: 'get' })
    } catch (error) {
      if (error instanceof Error && error.message === 'viewer_unavailable') {
        return { freshness: await applySkillFreshnessViewerAction(parsed.action) }
      }
      throw error
    }
  }
  return applySkillsViewerAction(parsed)
}
