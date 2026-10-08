import { translate } from '@/i18n/i18n'
import { getActivityVirtualItemKey } from '@/components/activity/activity-thread-virtual-items'
import { isActivityDestinationVisible } from './activity-workspace-destination'
import type { captureActivityThreadCommandTarget } from './activity-thread-command-target'

export function captureActivityThreadPreviewAction(
  context: ReturnType<typeof captureActivityThreadCommandTarget>,
  field: 'copy-path' | 'issue' | 'comment' | 'issue-menu' | 'review-menu'
): {
  action: HTMLButtonElement
  portal: HTMLElement
  stillExpected: () => boolean
  dispose: () => void
} {
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
  const labels =
    field === 'review-menu'
      ? ['PR', 'MR'].map((value0) =>
          translate(
            'auto.components.sidebar.WorktreeCardMeta.dbe2d18972',
            'More {{value0}} actions',
            { value0 }
          )
        )
      : [
          field === 'copy-path'
            ? translate('auto.components.activity.ActivityThreadHoverCard.copyPath', 'Copy path')
            : field === 'issue-menu'
              ? translate(
                  'auto.components.sidebar.WorktreeCardMeta.moreIssueActions',
                  'More issue actions'
                )
              : field === 'issue'
                ? translate('auto.components.sidebar.WorktreeCardMeta.807b13b9ec', 'Edit issue')
                : translate('auto.components.sidebar.WorktreeCardMeta.c7fa72ead0', 'Edit notes')
        ]
  const actions = [...(portal?.querySelectorAll<HTMLButtonElement>('button') ?? [])].filter(
    (node) => labels.includes(node.getAttribute('aria-label') ?? '')
  )
  const action = actions.length === 1 ? actions[0] : undefined
  const label = action?.getAttribute('aria-label')
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
      action.getAttribute('aria-label') === label &&
      isActivityDestinationVisible(portal) &&
      isActivityDestinationVisible(action) &&
      actionIntersectsPreview()
    )
  if (!action || !portal || (field === 'copy-path' && !thread.worktree.path) || !currentOwner()) {
    throw new Error(
      field === 'copy-path'
        ? 'activity_preview_copy_unavailable'
        : field === 'issue-menu'
          ? 'activity_preview_issue_menu_unavailable'
          : field === 'review-menu'
            ? 'activity_preview_review_menu_unavailable'
            : 'activity_preview_edit_unavailable'
    )
  }
  const recordChanges = (records: MutationRecord[]): void => {
    if (
      records.some(
        (record) =>
          (record.type === 'attributes' &&
            (record.target === trigger || record.target === portal || record.target === action)) ||
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
      'aria-label',
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
    action,
    portal,
    stillExpected,
    dispose: () => observer.disconnect()
  }
}
