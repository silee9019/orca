import { SetupGuideParams } from '../../../shared/rpc-contract/setup-guide-params'
import type { SetupGuideRequest, SetupGuideResult } from '../../../shared/setup-guide-command'
import { acquireSetupGuideSelectionLease } from './help-modal-open-lease'
import { readSetupGuideContent } from './setup-guide-rendered-content'

export async function applySetupGuideStepRequest(
  request: SetupGuideRequest,
  rootAvailable: () => boolean
): Promise<Omit<SetupGuideResult, 'viewerId'>> {
  const command = SetupGuideParams.parse(request.command)
  if (command.operation !== 'select-step') {
    throw new Error('invalid_setup_guide_operation')
  }
  const lease = acquireSetupGuideSelectionLease(request.expiresAt, rootAvailable)
  try {
    const dialog = lease.readDialog()
    if (!dialog) {
      throw new Error('setup_guide_not_open')
    }
    const revision = Number(dialog.dataset.setupGuideSelectionRevision)
    const rows = [
      ...dialog.querySelectorAll<HTMLButtonElement>('button[data-setup-guide-step-id]')
    ].filter((row) => row.dataset.setupGuideStepId === command.stepId)
    if (
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      revision >= Number.MAX_SAFE_INTEGER ||
      rows.length !== 1 ||
      rows[0].disabled ||
      !lease.visible(rows[0])
    ) {
      throw new Error('setup_guide_step_unavailable')
    }
    const expected = revision + 1
    let superseded = false
    const observe = (): void => {
      lease.observe()
      const current = Number(dialog.dataset.setupGuideSelectionRevision)
      if (
        lease.isSuperseded() ||
        !Number.isSafeInteger(current) ||
        current < revision ||
        current > expected
      ) {
        superseded = true
      }
    }
    rows[0].click()
    await Promise.resolve()
    let content = readSetupGuideContent(lease)
    const ready = (): boolean =>
      content.dialog === dialog &&
      content.stepId === command.stepId &&
      Number(dialog.dataset.setupGuideSelectionRevision) === expected
    observe()
    while (!superseded && !ready() && Date.now() < lease.deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
      observe()
      content = readSetupGuideContent(lease)
    }
    observe()
    content = readSetupGuideContent(lease)
    const applied = !superseded && Date.now() < lease.deadline && ready()
    return {
      viewer: 'host',
      source: 'help_menu',
      applied,
      dialogPresent: content.dialog !== null,
      contentPresent: content.stepId !== null,
      stepId: content.stepId,
      ...(!applied
        ? {
            reason: superseded
              ? ('viewer_surface_superseded' as const)
              : ('setup_guide_not_rendered' as const)
          }
        : {})
    }
  } finally {
    lease.release()
  }
}
