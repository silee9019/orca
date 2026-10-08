import { useAppStore } from '@/store'
import { isActivityDestinationVisible } from './activity-workspace-destination'
import { captureActivityThreadCommandTarget } from './activity-thread-command-target'
import { captureActivityThreadPreviewAction } from './activity-thread-preview-action'
import { readActivityViewerView } from './activity-viewer-view'
import type {
  ActivityViewerRequest,
  ActivityViewerResult
} from '../../../shared/activity-viewer-command'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'

export async function applyActivityThreadDetailsMenuRequest(
  request: ActivityViewerRequest,
  command: Extract<
    ActivityViewerCommand,
    { operation: 'preview-issue-menu' | 'preview-review-menu' }
  >
): Promise<Omit<ActivityViewerResult, 'viewerId'>> {
  const context = captureActivityThreadCommandTarget(command.surface, command.paneKey)
  const field = command.operation === 'preview-review-menu' ? 'review-menu' : 'issue-menu'
  const unavailable =
    field === 'review-menu'
      ? 'activity_preview_review_menu_unavailable'
      : 'activity_preview_issue_menu_unavailable'
  const preview = captureActivityThreadPreviewAction(context, field)
  const { action, portal } = preview
  const triggerId = action.id
  const expanded = action.getAttribute('aria-expanded')
  const outer = [
    ...context.root.querySelectorAll<HTMLElement>('[data-activity-preview-trigger]')
  ].find((node) => node.dataset.activityPreviewTrigger === portal.dataset.activityPreviewOwner)
  if (!triggerId || !outer || (expanded !== 'true' && expanded !== 'false')) {
    preview.dispose()
    throw new Error(unavailable)
  }
  const initialOpen = expanded === 'true'
  const originalMenuId = action.getAttribute('aria-controls')
  const originalMenu = originalMenuId ? document.getElementById(originalMenuId) : null
  let committedAction: HTMLButtonElement | null = null
  let committedMenu: HTMLElement | null = null
  let invalidated = false
  let previewRemoved = false
  const sourceOwner = portal.dataset.activityPreviewOwner
  const sourceLabel = action.getAttribute('aria-label')
  const immutableSource = (): boolean =>
    outer.dataset.activityPreviewTrigger === sourceOwner &&
    portal.dataset.activityPreviewOwner === sourceOwner &&
    portal.dataset.activityPreviewPane === context.thread.paneKey &&
    portal.dataset.activityPreviewWorkspace === context.workspaceId &&
    portal.dataset.activityPreviewHost === context.executionHostId
  const tooltipStates = new Set(['closed', 'instant-open', 'delayed-open'])
  const isClosedTooltipTrigger = (node: HTMLButtonElement | null): boolean =>
    !command.enabled &&
    node?.getAttribute('aria-expanded') === 'false' &&
    node.dataset.slot === 'tooltip-trigger' &&
    tooltipStates.has(node.dataset.state ?? '')
  const recordChanges = (records: MutationRecord[]): void => {
    if (
      records.some(
        (record) =>
          record.type === 'attributes' &&
          record.attributeName === 'aria-label' &&
          record.target instanceof HTMLButtonElement &&
          (record.target === action || record.target.id === triggerId)
      )
    ) {
      invalidated = true
    }
    if (
      records.some(
        (record) =>
          record.type === 'childList' &&
          [...record.addedNodes].some(
            (node) =>
              node === portal ||
              node.contains(portal) ||
              (node instanceof HTMLElement &&
                (node.dataset.activityPreviewOwner === sourceOwner ||
                  [...node.querySelectorAll<HTMLElement>('[data-activity-preview-owner]')].some(
                    (candidate) => candidate.dataset.activityPreviewOwner === sourceOwner
                  )))
          )
      )
    ) {
      invalidated = true
    }
    if (
      records.some(
        (record) =>
          record.type === 'childList' &&
          [...record.removedNodes].some((node) => node === portal || node.contains(portal))
      )
    ) {
      previewRemoved = true
    }
    if (
      records.some((record) =>
        record.type === 'attributes'
          ? ((record.target === portal || record.target === outer) &&
              (command.enabled ||
                record.attributeName !== 'data-state' ||
                record.oldValue === 'closed')) ||
            (record.target === committedAction &&
              (record.attributeName !== 'data-state' ||
                !isClosedTooltipTrigger(committedAction) ||
                !tooltipStates.has(record.oldValue ?? ''))) ||
            record.target === committedMenu
          : [...record.removedNodes].some(
              (node) =>
                node === outer ||
                node.contains(outer) ||
                (command.enabled && (node === portal || node.contains(portal))) ||
                (committedAction !== null &&
                  (node === committedAction || node.contains(committedAction))) ||
                (committedMenu !== null && (node === committedMenu || node.contains(committedMenu)))
            )
      )
    ) {
      invalidated = true
    }
  }
  const observer = new MutationObserver(recordChanges)
  const observation = {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [
      'id',
      'role',
      'aria-label',
      'aria-expanded',
      'aria-controls',
      'aria-labelledby',
      'data-state',
      'data-slot',
      'data-activity-preview-owner',
      'data-activity-preview-trigger',
      'data-activity-preview-pane',
      'data-activity-preview-workspace',
      'data-activity-preview-host'
    ]
  }
  for (const node of [document.body, portal, outer, originalMenu]) {
    if (node) {
      observer.observe(node, observation)
    }
  }
  observer.observe(action, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['aria-label']
  })
  const unsubscribe = useAppStore.subscribe(context.observe)
  let visible: boolean | null = null
  const inspect = (): boolean => {
    recordChanges(observer.takeRecords())
    context.observe()
    if (
      (previewRemoved && portal.isConnected) ||
      (!portal.isConnected &&
        [...document.querySelectorAll<HTMLElement>('[data-activity-preview-owner]')].some(
          (node) => node.dataset.activityPreviewOwner === sourceOwner
        ))
    ) {
      invalidated = true
    }
    if (invalidated || !immutableSource() || !context.stillExpected()) {
      return false
    }
    if (!portal.isConnected) {
      visible = false
      return !command.enabled && !originalMenu?.isConnected
    }
    let current: ReturnType<typeof captureActivityThreadPreviewAction> | null = null
    if (command.enabled) {
      try {
        current = captureActivityThreadPreviewAction(context, field)
      } catch {
        return false
      }
    }
    try {
      const closingActions = [...portal.querySelectorAll<HTMLButtonElement>('button')].filter(
        (node) => node.id === triggerId && node.getAttribute('aria-label') === sourceLabel
      )
      const next = current?.action ?? (closingActions.length === 1 ? closingActions[0] : undefined)
      if (!next || next.disabled) {
        return false
      }
      if (
        (current && current.portal !== portal) ||
        next.id !== triggerId ||
        next.getAttribute('aria-label') !== sourceLabel
      ) {
        invalidated = true
        return false
      }
      const expanded = next.getAttribute('aria-expanded')
      if (expanded !== 'true' && expanded !== 'false') {
        return false
      }
      const open = expanded === 'true'
      // A closed menu wraps its trigger in Tooltip, which owns data-state on the same button.
      if (!isClosedTooltipTrigger(next) && next.dataset.state !== (open ? 'open' : 'closed')) {
        return false
      }
      const menuId = next.getAttribute('aria-controls')
      const menu = menuId ? document.getElementById(menuId) : null
      if (open) {
        visible = Boolean(
          menu &&
          menu.getAttribute('role') === 'menu' &&
          menu.getAttribute('aria-labelledby') === triggerId &&
          menu.dataset.state === 'open' &&
          isActivityDestinationVisible(menu)
        )
        if (!visible || !command.enabled || !context.stillExpected()) {
          return false
        }
      } else {
        visible = false
        if (command.enabled || originalMenu?.isConnected) {
          return false
        }
      }
      if (
        (committedAction && committedAction !== next) ||
        (committedMenu && committedMenu !== menu)
      ) {
        invalidated = true
        return false
      }
      committedAction = next
      committedMenu = menu
      return true
    } finally {
      current?.dispose()
    }
  }
  try {
    if (!preview.stillExpected() || !context.stillExpected() || Date.now() >= request.expiresAt) {
      throw new Error(unavailable)
    }
    if (
      initialOpen &&
      (!originalMenu ||
        originalMenu.getAttribute('role') !== 'menu' ||
        originalMenu.getAttribute('aria-labelledby') !== triggerId ||
        !isActivityDestinationVisible(originalMenu))
    ) {
      throw new Error(unavailable)
    }
    if (initialOpen !== command.enabled) {
      action.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      )
    }
    // The original Tooltip branch replaces its trigger when the menu opens or closes.
    preview.dispose()
    const deadline = Math.min(request.expiresAt, Date.now() + 5000)
    let applied = false
    while (Date.now() < deadline && !invalidated) {
      if (inspect()) {
        await Promise.resolve()
        applied = inspect() && Date.now() < request.expiresAt
        break
      }
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(16, Math.max(0, deadline - Date.now())))
      )
    }
    const { initial } = context
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
      rendered: context.sameRuntime() ? readActivityViewerView(command.surface) : null,
      ...(field === 'review-menu'
        ? { reviewMenuAction: { paneKey: command.paneKey, enabled: command.enabled, visible } }
        : { issueMenuAction: { paneKey: command.paneKey, enabled: command.enabled, visible } }),
      ...(!context.sameRuntime()
        ? { reason: 'viewer_runtime_changed' as const }
        : !context.stillOwned() || invalidated
          ? { reason: 'viewer_surface_superseded' as const }
          : !applied
            ? { reason: 'viewer_not_applied' as const }
            : {})
    }
  } finally {
    preview.dispose()
    observer.disconnect()
    unsubscribe()
  }
}
