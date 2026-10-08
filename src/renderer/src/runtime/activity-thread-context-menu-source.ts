import { getActivityVirtualItemKey } from '@/components/activity/activity-thread-virtual-items'
import { isActivityDestinationVisible } from './activity-workspace-destination'
import type { captureActivityThreadCommandTarget } from './activity-thread-command-target'

export function captureActivityThreadContextMenuSource(
  context: ReturnType<typeof captureActivityThreadCommandTarget>
) {
  const { root, thread } = context
  const unavailable = 'activity_context_menu_unavailable'
  const key = getActivityVirtualItemKey({ type: 'thread', thread, groupKey: '' })
  const rows = [...root.querySelectorAll<HTMLElement>('[data-activity-viewer-thread]')].filter(
    (node) => node.dataset.activityViewerThread === key
  )
  const row = rows.length === 1 ? rows[0] : undefined
  const triggers = [
    ...(row?.querySelectorAll<HTMLElement>('[data-slot="context-menu-trigger"]') ?? [])
  ]
  const trigger = triggers.length === 1 ? triggers[0] : undefined
  const owner = trigger?.dataset.activityContextTrigger
  const scroll = root.querySelector('[data-activity-virtual-list]')?.parentElement
  const point = (): { x: number; y: number } | null => {
    if (
      !trigger ||
      !scroll ||
      !isActivityDestinationVisible(trigger) ||
      !isActivityDestinationVisible(scroll)
    ) {
      return null
    }
    const bounds = trigger.getBoundingClientRect()
    const viewport = scroll.getBoundingClientRect()
    const sticky = root
      .querySelector('[data-activity-sticky-header-active]')
      ?.getBoundingClientRect()
    const left = Math.max(bounds.left, viewport.left, 0)
    const right = Math.min(bounds.right, viewport.right, window.innerWidth)
    const top = Math.max(bounds.top, viewport.top, sticky?.bottom ?? viewport.top, 0)
    const bottom = Math.min(bounds.bottom, viewport.bottom, window.innerHeight)
    return left < right && top < bottom ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null
  }
  const sourceMatches = (): boolean =>
    Boolean(
      trigger &&
      row &&
      owner &&
      trigger.isConnected &&
      root.contains(row) &&
      row.contains(trigger) &&
      trigger.dataset.activityContextTrigger === owner &&
      trigger.dataset.activityContextPane === thread.paneKey &&
      trigger.dataset.activityContextWorkspace === context.workspaceId &&
      trigger.dataset.slot === 'context-menu-trigger' &&
      !trigger.hasAttribute('disabled') &&
      trigger.getAttribute('aria-disabled') !== 'true' &&
      point()
    )
  if (
    !trigger ||
    !owner ||
    !sourceMatches() ||
    !['open', 'closed'].includes(trigger.dataset.state ?? '')
  ) {
    throw new Error(unavailable)
  }
  return { trigger, owner, point, sourceMatches }
}
