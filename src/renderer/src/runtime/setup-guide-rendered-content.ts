import { isFeatureWallSetupStepId } from '../../../shared/feature-wall-setup-steps'

export function readSetupGuideContent(lease: {
  readDialog: () => HTMLElement | null
  visible: (node: HTMLElement) => boolean
}): { dialog: HTMLElement | null; stepId: string | null } {
  const { visible } = lease
  const dialog = lease.readDialog()
  const stepId = dialog?.dataset.setupGuideStep
  if (!dialog || !isFeatureWallSetupStepId(stepId)) {
    return { dialog, stepId: null }
  }
  const selected = [...dialog.querySelectorAll<HTMLElement>('button[aria-current="step"]')].filter(
    visible
  )
  const sections = [
    ...dialog.querySelectorAll<HTMLElement>('[data-setup-guide-content-step]')
  ].filter(visible)
  const section = sections.length === 1 ? sections[0] : null
  const heading = section?.querySelector('h3')
  const description = section?.querySelector<HTMLElement>('[data-setup-guide-description="true"]')
  const action = section?.querySelector<HTMLElement>('[data-setup-guide-action="true"]')
  const completed = section?.querySelector<HTMLElement>('[data-setup-guide-completed="true"]')
  const actionReady =
    action instanceof HTMLElement &&
    ((action.childElementCount > 0 && visible(action)) ||
      (stepId === 'two-worktrees' &&
        action.childElementCount === 0 &&
        completed instanceof HTMLElement &&
        !!completed.textContent?.trim() &&
        visible(completed)))
  const ready =
    selected.length === 1 &&
    selected[0].dataset.setupGuideStepId === stepId &&
    section?.dataset.setupGuideContentStep === stepId &&
    heading instanceof HTMLElement &&
    !!heading.textContent?.trim() &&
    visible(heading) &&
    description instanceof HTMLElement &&
    !!description.textContent?.trim() &&
    visible(description) &&
    actionReady
  return { dialog, stepId: ready ? stepId : null }
}
