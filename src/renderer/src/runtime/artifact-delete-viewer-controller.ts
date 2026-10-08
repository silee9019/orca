import {
  ArtifactDeleteConfirmationSchema,
  type ArtifactDeleteConfirmation
} from '../../../shared/artifact-delete-viewer-command'
type Target = { slug: string; reviewedTarget: string }
type State = { viewer: 'desktop'; committed: true; confirmationOpen: false }
type Control = {
  target: Target
  settle: (confirmed: boolean) => void
  pending: { resolve: (state: State) => void } | null
}
const activeConfirmations = new Set<Control>()
export function bindArtifactDeleteConfirmation(target: Target) {
  return (settle: Control['settle']) => {
    const control: Control = { target, settle, pending: null }
    activeConfirmations.add(control)
    return () => {
      activeConfirmations.delete(control)
      control.pending?.resolve({ viewer: 'desktop', committed: true, confirmationOpen: false })
      control.pending = null
    }
  }
}
export async function applyArtifactDeleteConfirmation(
  action: ArtifactDeleteConfirmation
): Promise<State> {
  const parsed = ArtifactDeleteConfirmationSchema.parse(action)
  const matches = [...activeConfirmations].filter(
    ({ target }) => target.slug === parsed.slug && target.reviewedTarget === parsed.reviewedTarget
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
