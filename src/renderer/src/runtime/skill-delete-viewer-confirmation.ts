import type { SkillDeletePlan } from '../../../shared/skill-delete-contract'
import { SkillsDeleteConfirmationSchema } from '../../../shared/skills-viewer-command'
import type { z } from 'zod'

type State = { viewer: 'desktop'; committed: true; confirmationOpen: false }
type Confirmation = {
  plan: SkillDeletePlan
  settle: (confirmed: boolean) => void
  pending: { resolve: (state: State) => void } | null
}
const activeConfirmations = new Set<Confirmation>()
export function skillDeletionConfirmationSnapshot(): SkillDeletePlan | null {
  if (activeConfirmations.size !== 1) {
    return null
  }
  return activeConfirmations.values().next().value?.plan ?? null
}
export function bindSkillDeletionConfirmation(plan: SkillDeletePlan) {
  return (settle: Confirmation['settle']) => {
    const control: Confirmation = { plan, settle, pending: null }
    activeConfirmations.add(control)
    return () => {
      activeConfirmations.delete(control)
      control.pending?.resolve({ viewer: 'desktop', committed: true, confirmationOpen: false })
      control.pending = null
    }
  }
}
export async function applySkillDeletionConfirmation(
  action: z.infer<typeof SkillsDeleteConfirmationSchema>
): Promise<State> {
  const parsed = SkillsDeleteConfirmationSchema.parse(action)
  const matches = [...activeConfirmations].filter(
    ({ plan }) => plan.operationId === parsed.operationId
  )
  if (matches.length !== 1) {
    throw new Error(
      matches.length
        ? 'viewer_ambiguous'
        : activeConfirmations.size
          ? 'viewer_target_changed'
          : 'viewer_unavailable'
    )
  }
  const control = matches[0]
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  if (control.pending) {
    throw new Error('viewer_busy')
  }
  return new Promise((resolve) => {
    control.pending = { resolve }
    control.settle(parsed.confirmed)
  })
}
