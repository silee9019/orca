import { SetupGuideParams } from '../../../shared/rpc-contract/setup-guide-params'
import type { SetupGuideRequest, SetupGuideResult } from '../../../shared/setup-guide-command'
import { isFeatureWallSetupStepId } from '../../../shared/feature-wall-setup-steps'
import { openSetupGuideFromHelp } from './setup-guide-open'
import { acquireHelpModalOpenLease } from './help-modal-open-lease'

export async function applySetupGuideRequest(
  request: SetupGuideRequest,
  rootAvailable: () => boolean
): Promise<Omit<SetupGuideResult, 'viewerId'>> {
  SetupGuideParams.parse(request.command)
  const lease = acquireHelpModalOpenLease('setup-guide', request.expiresAt, rootAvailable)
  const { visible } = lease
  const readContent = (): { dialog: HTMLElement | null; stepId: string | null } => {
    const dialog = lease.readDialog()
    const stepId = dialog?.dataset.setupGuideStep
    if (!dialog || !isFeatureWallSetupStepId(stepId)) {
      return { dialog, stepId: null }
    }
    const selected = [
      ...dialog.querySelectorAll<HTMLElement>('button[aria-current="step"]')
    ].filter(visible)
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
  try {
    openSetupGuideFromHelp()
    lease.observe()
    const { deadline } = lease
    let content = readContent()
    while (!lease.isSuperseded() && content.stepId === null && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
      lease.observe()
      content = readContent()
    }
    lease.observe()
    content = readContent()
    const applied = !lease.isSuperseded() && Date.now() < deadline && content.stepId !== null
    return {
      viewer: 'host',
      source: 'help_menu',
      applied,
      dialogPresent: content.dialog !== null,
      contentPresent: content.stepId !== null,
      stepId: content.stepId,
      ...(!applied
        ? {
            reason: lease.isSuperseded()
              ? ('viewer_surface_superseded' as const)
              : ('setup_guide_not_rendered' as const)
          }
        : {})
    }
  } finally {
    lease.release()
  }
}
