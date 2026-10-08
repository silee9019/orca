import { SetupGuideParams } from '../../../shared/rpc-contract/setup-guide-params'
import type { SetupGuideRequest, SetupGuideResult } from '../../../shared/setup-guide-command'
import { useAppStore } from '@/store'
import { acquireSetupGuideSelectionLease } from './help-modal-open-lease'
import { readSetupGuideContent } from './setup-guide-rendered-content'

export async function applySetupGuideHideRequest(
  request: SetupGuideRequest,
  rootAvailable: () => boolean
): Promise<Omit<SetupGuideResult, 'viewerId'>> {
  const command = SetupGuideParams.parse(request.command)
  if (command.operation !== 'hide-sidebar') {
    throw new Error('invalid_setup_guide_operation')
  }
  const lease = acquireSetupGuideSelectionLease(request.expiresAt, rootAvailable)
  let unsubscribe = (): void => {}
  try {
    const initial = readSetupGuideContent(lease)
    const dialog = initial.dialog
    if (!dialog || initial.stepId === null) {
      throw new Error('setup_guide_not_open')
    }
    const revision = dialog.dataset.setupGuideSelectionRevision
    const buttons = [
      ...dialog.querySelectorAll<HTMLButtonElement>('button[data-setup-guide-hide-sidebar="true"]')
    ]
    if (buttons.length !== 1 || buttons[0].disabled || !lease.visible(buttons[0])) {
      throw new Error('setup_guide_hide_unavailable')
    }
    const initiallyDismissed = useAppStore.getState().setupGuideSidebarDismissed
    let reachedDismissed = initiallyDismissed
    let superseded = false
    const observe = (): void => {
      lease.observe()
      const dismissed = useAppStore.getState().setupGuideSidebarDismissed
      if (reachedDismissed && !dismissed) {
        superseded = true
      }
      reachedDismissed ||= dismissed
      if (
        lease.isSuperseded() ||
        dialog.dataset.setupGuideSelectionRevision !== revision ||
        dialog.dataset.setupGuideStep !== initial.stepId
      ) {
        superseded = true
      }
    }
    unsubscribe = useAppStore.subscribe(observe)
    buttons[0].click()
    await Promise.resolve()
    let content = readSetupGuideContent(lease)
    const rendered = (): boolean =>
      content.dialog === dialog &&
      content.stepId === initial.stepId &&
      useAppStore.getState().setupGuideSidebarDismissed
    observe()
    while (!superseded && !rendered() && Date.now() < lease.deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
      observe()
      content = readSetupGuideContent(lease)
    }
    observe()
    content = readSetupGuideContent(lease)
    const applied = !superseded && Date.now() < lease.deadline && rendered()
    return {
      viewer: 'host',
      source: 'help_menu',
      applied,
      dialogPresent: content.dialog !== null,
      contentPresent: content.stepId !== null,
      stepId: content.stepId,
      sidebarDismissed: useAppStore.getState().setupGuideSidebarDismissed,
      changed: applied && !initiallyDismissed,
      writeOutcome: 'unverified',
      diskPersistence: 'unverified',
      ...(!applied
        ? {
            reason: superseded
              ? ('viewer_surface_superseded' as const)
              : ('setup_guide_not_rendered' as const)
          }
        : {})
    }
  } finally {
    unsubscribe()
    lease.release()
  }
}
