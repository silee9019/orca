import { translate } from '@/i18n/i18n'
import { readActivityPreviewIssueCopyControl } from './activity-preview-issue-copy-controls'
import { captureActivityThreadPreviewAction } from './activity-thread-preview-action'
import { isActivityDestinationVisible } from './activity-workspace-destination'
import type { captureActivityThreadCommandTarget } from './activity-thread-command-target'
export function captureActivityPreviewIssueCopyTarget(
  context: ReturnType<typeof captureActivityThreadCommandTarget>
) {
  const preview = captureActivityThreadPreviewAction(context, 'issue-menu')
  const { portal, action } = preview
  const owner = portal.dataset.activityPreviewOwner
  const outer = [
    ...context.root.querySelectorAll<HTMLElement>('[data-activity-preview-trigger]')
  ].find((node) => node.dataset.activityPreviewTrigger === owner)
  const lease = readActivityPreviewIssueCopyControl(portal)
  const menuId = action.getAttribute('aria-controls')
  const menu = menuId ? document.getElementById(menuId) : null
  const label = translate('auto.components.sidebar.WorktreeCardMeta.copyLink', 'Copy link')
  const items = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].filter(
    (node) => node.textContent?.trim() === label
  )
  const item = items.length === 1 ? items[0] : undefined
  if (
    !outer ||
    !lease?.url ||
    !menu ||
    !item ||
    action.getAttribute('aria-expanded') !== 'true' ||
    action.dataset.state !== 'open' ||
    menu.getAttribute('role') !== 'menu' ||
    menu.getAttribute('aria-labelledby') !== action.id ||
    menu.dataset.state !== 'open' ||
    !isActivityDestinationVisible(menu) ||
    !isActivityDestinationVisible(item) ||
    item.getAttribute('aria-disabled') === 'true' ||
    item.hasAttribute('data-disabled')
  ) {
    preview.dispose()
    throw new Error('activity_preview_issue_copy_unavailable')
  }
  const bounds = item.getBoundingClientRect()
  const menuBounds = menu.getBoundingClientRect()
  if (
    Math.max(bounds.top, menuBounds.top, 0) >=
      Math.min(bounds.bottom, menuBounds.bottom, window.innerHeight) ||
    Math.max(bounds.left, menuBounds.left, 0) >=
      Math.min(bounds.right, menuBounds.right, window.innerWidth)
  ) {
    preview.dispose()
    throw new Error('activity_preview_issue_copy_unavailable')
  }
  let invalidated = false
  let dispatched = false
  const sourceOwner = (): boolean =>
    outer.dataset.activityPreviewTrigger === owner &&
    context.root.contains(outer) &&
    portal.dataset.activityPreviewOwner === owner &&
    portal.dataset.activityPreviewPane === context.thread.paneKey &&
    portal.dataset.activityPreviewWorkspace === context.workspaceId &&
    portal.dataset.activityPreviewHost === context.executionHostId
  const sameOwnerPreview = (node: Node): boolean =>
    node === portal ||
    node.contains(portal) ||
    (node instanceof HTMLElement &&
      (node.dataset.activityPreviewOwner === owner ||
        [...node.querySelectorAll<HTMLElement>('[data-activity-preview-owner]')].some(
          (candidate) => candidate.dataset.activityPreviewOwner === owner
        )))
  const isOwnedMenu = (node: Element): boolean =>
    node.getAttribute('role') === 'menu' && node.getAttribute('aria-labelledby') === action.id
  const record = (records: MutationRecord[]): void => {
    if (
      records.some((change) =>
        change.type === 'attributes'
          ? (change.target === portal || change.target === outer || change.target === menu) &&
            (change.attributeName !== 'data-state' || !dispatched || change.oldValue === 'closed')
          : [...change.removedNodes].some((node) => node === outer || node.contains(outer)) ||
            [...change.addedNodes].some(
              (node) =>
                sameOwnerPreview(node) ||
                node === menu ||
                node.contains(menu) ||
                (node instanceof HTMLElement &&
                  (isOwnedMenu(node) ||
                    [...node.querySelectorAll('[role="menu"]')].some(isOwnedMenu)))
            )
      )
    ) {
      invalidated = true
    }
  }
  const observer = new MutationObserver(record)
  const observerOptions: MutationObserverInit = {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [
      'id',
      'role',
      'aria-labelledby',
      'data-state',
      'data-activity-preview-owner',
      'data-activity-preview-trigger',
      'data-activity-preview-pane',
      'data-activity-preview-workspace',
      'data-activity-preview-host'
    ]
  }
  observer.observe(document.body, observerOptions)
  for (const source of [portal, outer, menu]) {
    observer.observe(source, observerOptions)
  }
  const available = (): boolean => {
    record(observer.takeRecords())
    context.observe()
    return (
      context.sameRuntime() &&
      !invalidated &&
      sourceOwner() &&
      context.stillOwned() &&
      (!portal.isConnected || lease.isCurrent())
    )
  }
  const closed = (): boolean =>
    available() && !portal.isConnected && !menu.isConnected && outer.dataset.state === 'closed'
  return {
    target: { key: 'issue-link', label: '', value: lease.url },
    copy: (): Promise<boolean> => {
      if (!available() || !preview.stillExpected() || !lease.isCurrent()) {
        throw new Error('activity_preview_issue_copy_unavailable')
      }
      dispatched = true
      preview.dispose()
      return lease.copy()
    },
    closed,
    available,
    waitForClose: async (timeout: number): Promise<boolean> => {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline && available()) {
        if (closed()) {
          await Promise.resolve()
          return closed()
        }
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(16, Math.max(0, deadline - Date.now())))
        )
      }
      return false
    },
    dispose: (): void => {
      observer.disconnect()
      preview.dispose()
    }
  }
}
