import type { ActivityThreadCopyTarget } from '@/components/activity/activity-thread-copy'
import { getActivityVirtualItemKey } from '@/components/activity/activity-thread-virtual-items'
import { isActivityDestinationVisible } from './activity-workspace-destination'
import type { captureActivityThreadCommandTarget } from './activity-thread-command-target'

export function captureActivityPreviewCopyTarget(
  context: ReturnType<typeof captureActivityThreadCommandTarget>
): { target: ActivityThreadCopyTarget; stillExpected: () => boolean; dispose: () => void } {
  const { root, thread, workspaceId, executionHostId } = context
  const key = getActivityVirtualItemKey({ type: 'thread', thread, groupKey: '' })
  const wrapper = [...root.querySelectorAll<HTMLElement>('[data-activity-viewer-thread]')].find(
    (node) => node.dataset.activityViewerThread === key
  )
  const trigger = wrapper?.querySelector<HTMLElement>(
    '[data-activity-preview-trigger][role="listitem"]'
  )
  const owner = trigger?.dataset.activityPreviewTrigger
  const portal = [...document.querySelectorAll<HTMLElement>('[data-activity-preview-owner]')].find(
    (node) => node.dataset.activityPreviewOwner === owner
  )
  const action = portal?.querySelector<HTMLElement>('[data-activity-preview-copy-path] button')
  const actionIntersectsPreview = (): boolean => {
    if (!portal || !action) {
      return false
    }
    const viewport = portal.getBoundingClientRect()
    const bounds = action.getBoundingClientRect()
    return (
      Math.max(bounds.top, viewport.top, 0) <
        Math.min(bounds.bottom, viewport.bottom, window.innerHeight) &&
      Math.max(bounds.left, viewport.left, 0) <
        Math.min(bounds.right, viewport.right, window.innerWidth)
    )
  }
  let invalidated = false
  const currentOwner = (): boolean =>
    Boolean(
      trigger &&
      owner &&
      portal &&
      action &&
      root.contains(trigger) &&
      wrapper?.contains(trigger) &&
      trigger.dataset.activityPreviewTrigger === owner &&
      trigger.dataset.state === 'open' &&
      portal.isConnected &&
      portal.dataset.state === 'open' &&
      portal.dataset.activityPreviewOwner === owner &&
      portal.dataset.activityPreviewPane === thread.paneKey &&
      portal.dataset.activityPreviewWorkspace === workspaceId &&
      portal.dataset.activityPreviewHost === executionHostId &&
      portal.contains(action) &&
      !action.hasAttribute('disabled') &&
      isActivityDestinationVisible(portal) &&
      isActivityDestinationVisible(action) &&
      actionIntersectsPreview()
    )
  if (!thread.worktree.path || !currentOwner()) {
    throw new Error('activity_preview_copy_unavailable')
  }
  const recordChanges = (records: MutationRecord[]): void => {
    if (
      records.some(
        (record) =>
          (record.type === 'attributes' &&
            (record.target === trigger || record.target === portal)) ||
          (record.type === 'childList' &&
            [...record.removedNodes].some(
              (node) =>
                node === trigger ||
                node === portal ||
                node === action ||
                node.contains(trigger ?? null) ||
                node.contains(portal ?? null) ||
                node.contains(action ?? null)
            ))
      )
    ) {
      invalidated = true
    }
  }
  const observer = new MutationObserver(recordChanges)
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'data-state',
      'data-activity-preview-owner',
      'data-activity-preview-trigger',
      'data-activity-preview-pane',
      'data-activity-preview-workspace',
      'data-activity-preview-host'
    ]
  })
  const stillExpected = (): boolean => {
    recordChanges(observer.takeRecords())
    return !invalidated && currentOwner()
  }
  return {
    target: { key: 'path', label: '', value: thread.worktree.path },
    stillExpected,
    dispose: () => observer.disconnect()
  }
}
