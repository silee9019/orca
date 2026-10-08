import { FeatureTourParams } from '../../../shared/rpc-contract/feature-tour-params'
import type { FeatureTourRequest, FeatureTourResult } from '../../../shared/feature-tour-command'
import { openFeatureTourFromHelp } from './feature-tour-open'
import { acquireHelpModalOpenLease } from './help-modal-open-lease'

export async function applyFeatureTourRequest(
  request: FeatureTourRequest,
  rootAvailable: () => boolean
): Promise<Omit<FeatureTourResult, 'viewerId'>> {
  FeatureTourParams.parse(request.command)
  const lease = acquireHelpModalOpenLease('feature-tour', request.expiresAt, rootAvailable)
  const { visible } = lease
  const readContent = (): { dialog: HTMLElement | null; workflowId: string | null } => {
    const dialog = lease.readDialog()
    if (!dialog) {
      return { dialog: null, workflowId: null }
    }
    const tabs = [
      ...dialog.querySelectorAll<HTMLButtonElement>(
        'button[role="tab"][aria-selected="true"][data-feature-wall-workflow-id]'
      )
    ].filter(visible)
    const tab = tabs.length === 1 ? tabs[0] : null
    const panelId = tab?.getAttribute('aria-controls')
    const panel = panelId ? document.getElementById(panelId) : null
    const headingId = panel?.getAttribute('aria-labelledby')
    const heading = headingId ? document.getElementById(headingId) : null
    const contentReady =
      panel instanceof HTMLElement &&
      dialog.contains(panel) &&
      panel.getAttribute('role') === 'tabpanel' &&
      visible(panel) &&
      heading instanceof HTMLElement &&
      panel.contains(heading) &&
      heading.tagName === 'H3' &&
      !!heading.textContent?.trim() &&
      visible(heading)
    return {
      dialog,
      workflowId: contentReady ? (tab?.dataset.featureWallWorkflowId ?? null) : null
    }
  }
  try {
    openFeatureTourFromHelp()
    lease.observe()
    const { deadline } = lease
    let content = readContent()
    while (!lease.isSuperseded() && content.workflowId === null && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
      lease.observe()
      content = readContent()
    }
    lease.observe()
    content = readContent()
    const applied = !lease.isSuperseded() && Date.now() < deadline && content.workflowId !== null
    return {
      viewer: 'host',
      source: 'help_menu',
      applied,
      dialogPresent: content.dialog !== null,
      contentPresent: content.workflowId !== null,
      workflowId: content.workflowId,
      ...(!applied
        ? {
            reason: lease.isSuperseded()
              ? ('viewer_surface_superseded' as const)
              : ('feature_tour_not_rendered' as const)
          }
        : {})
    }
  } finally {
    lease.release()
  }
}
