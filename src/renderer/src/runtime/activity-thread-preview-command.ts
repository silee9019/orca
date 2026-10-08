import { useAppStore } from '@/store'
import { getActivityVirtualItemKey } from '@/components/activity/activity-thread-virtual-items'
import type {
  ActivityViewerRequest,
  ActivityViewerResult
} from '../../../shared/activity-viewer-command'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'
import { captureActivityThreadCommandTarget } from './activity-thread-command-target'
import { isActivityDestinationVisible } from './activity-workspace-destination'
import { readActivityViewerView } from './activity-viewer-view'

export async function applyActivityThreadPreviewRequest(
  request: ActivityViewerRequest,
  command: Extract<ActivityViewerCommand, { operation: 'preview' }>
): Promise<Omit<ActivityViewerResult, 'viewerId'>> {
  const context = captureActivityThreadCommandTarget(command.surface, command.paneKey)
  const { initial, root, thread, workspaceId, executionHostId, sameRuntime, observe } = context
  const key = getActivityVirtualItemKey({ type: 'thread', thread, groupKey: '' })
  const wrapper = [...root.querySelectorAll<HTMLElement>('[data-activity-viewer-thread]')].find(
    (row) => row.dataset.activityViewerThread === key
  )
  const trigger = wrapper?.querySelector<HTMLElement>(
    '[data-activity-preview-trigger][role="listitem"]'
  )
  const owner = trigger?.dataset.activityPreviewTrigger
  const scroll = root.querySelector('[data-activity-virtual-list]')?.parentElement
  const targetVisible = (): boolean => {
    if (
      !trigger ||
      !scroll ||
      !isActivityDestinationVisible(trigger) ||
      !isActivityDestinationVisible(scroll)
    ) {
      return false
    }
    const rect = trigger.getBoundingClientRect()
    const viewport = scroll.getBoundingClientRect()
    const sticky = root
      .querySelector('[data-activity-sticky-header-active]')
      ?.getBoundingClientRect()
    const top = sticky
      ? Math.max(viewport.top, Math.min(sticky.bottom, viewport.bottom))
      : viewport.top
    return (
      rect.bottom > top &&
      rect.top < viewport.bottom &&
      rect.right > viewport.left &&
      rect.left < viewport.right
    )
  }
  if (!wrapper || !trigger || !owner || !targetVisible() || typeof PointerEvent === 'undefined') {
    throw new Error('activity_preview_unavailable')
  }
  const content = (): HTMLElement | null =>
    [...document.querySelectorAll<HTMLElement>('[data-activity-preview-owner]')].find(
      (node) => node.dataset.activityPreviewOwner === owner
    ) ?? null
  const ownsContent = (node: HTMLElement): boolean =>
    node.dataset.activityPreviewPane === command.paneKey &&
    node.dataset.activityPreviewWorkspace === workspaceId &&
    node.dataset.activityPreviewHost === executionHostId
  const stillExpected = (): boolean => {
    const portal = content()
    return (
      context.stillExpected() &&
      trigger.isConnected &&
      root.contains(trigger) &&
      wrapper.contains(trigger) &&
      trigger.dataset.activityPreviewTrigger === owner &&
      targetVisible() &&
      (portal === null || ownsContent(portal))
    )
  }
  const visible = (): boolean => {
    const portal = content()
    return (
      portal !== null &&
      ownsContent(portal) &&
      portal.dataset.state === 'open' &&
      isActivityDestinationVisible(portal)
    )
  }
  const matches = (): boolean =>
    stillExpected() &&
    (command.enabled
      ? trigger.dataset.state === 'open' && visible()
      : trigger.dataset.state === 'closed' && content() === null)
  const unsubscribe = useAppStore.subscribe(observe)
  try {
    const rect = trigger.getBoundingClientRect()
    trigger.dispatchEvent(
      new PointerEvent(command.enabled ? 'pointerover' : 'pointerout', {
        bubbles: true,
        pointerType: 'mouse',
        relatedTarget: document.body,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      })
    )
    observe()
    const deadline = Math.min(request.expiresAt - 25, Date.now() + 5000)
    while (stillExpected() && !matches() && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    const available = stillExpected()
    const applied = Date.now() < request.expiresAt && matches()
    return {
      viewer: 'host',
      surface: command.surface,
      dispatched: true,
      applied,
      persisted: null,
      writeOutcome: 'not_requested',
      groupBy: initial.agentsGroupBy,
      readFilter: initial.agentsReadFilter,
      compact: initial.agentsCompactMode,
      showChildAgents: initial.agentsShowChildAgents,
      rendered: sameRuntime() ? readActivityViewerView(command.surface) : null,
      previewAction: {
        paneKey: command.paneKey,
        enabled: command.enabled,
        visible: available ? visible() : null
      },
      ...(!sameRuntime()
        ? { reason: 'viewer_runtime_changed' as const }
        : !available
          ? { reason: 'viewer_surface_superseded' as const }
          : !applied
            ? { reason: 'viewer_not_applied' as const }
            : {})
    }
  } finally {
    unsubscribe()
  }
}
