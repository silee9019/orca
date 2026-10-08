import {
  SkillsViewerActionSchema,
  type SkillsViewerAction
} from '../../../shared/skills-viewer-command'
import { applySkillFreshnessViewerAction } from './skill-freshness-viewer-controller'
import { applySkillsViewerAction } from './skills-viewer-controller'

export async function applySkillsViewerRequest(action: SkillsViewerAction) {
  const parsed = SkillsViewerActionSchema.parse(action)
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
