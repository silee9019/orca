import { readSetupGuideContent } from './setup-guide-rendered-content'
import { applySetupGuideStepRequest } from './setup-guide-step-command'
import { SetupGuideParams } from '../../../shared/rpc-contract/setup-guide-params'
import type { SetupGuideRequest, SetupGuideResult } from '../../../shared/setup-guide-command'
import { openSetupGuideFromHelp } from './setup-guide-open'
import { acquireHelpModalOpenLease } from './help-modal-open-lease'

export async function applySetupGuideRequest(
  request: SetupGuideRequest,
  rootAvailable: () => boolean
): Promise<Omit<SetupGuideResult, 'viewerId'>> {
  const command = SetupGuideParams.parse(request.command)
  if (command.operation === 'select-step') {
    return applySetupGuideStepRequest({ ...request, command }, rootAvailable)
  }
  const lease = acquireHelpModalOpenLease('setup-guide', request.expiresAt, rootAvailable)

  try {
    openSetupGuideFromHelp()
    lease.observe()
    const { deadline } = lease
    let content = readSetupGuideContent(lease)
    while (!lease.isSuperseded() && content.stepId === null && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
      lease.observe()
      content = readSetupGuideContent(lease)
    }
    lease.observe()
    content = readSetupGuideContent(lease)
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
