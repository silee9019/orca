import { captureActivityThreadContextMenuSource } from './activity-thread-context-menu-source'
import { useAppStore } from '@/store'
import type {
  ActivityViewerRequest,
  ActivityViewerResult
} from '../../../shared/activity-viewer-command'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'
import { captureActivityThreadCommandTarget } from './activity-thread-command-target'
import { isActivityDestinationVisible } from './activity-workspace-destination'
import { readActivityViewerView } from './activity-viewer-view'
import { readActivityContextMenuControl } from './activity-context-menu-controls'

export async function applyActivityThreadContextMenuRequest(
  request: ActivityViewerRequest,
  command: Extract<ActivityViewerCommand, { operation: 'context-menu' }>
): Promise<Omit<ActivityViewerResult, 'viewerId'>> {
  const context = captureActivityThreadCommandTarget(command.surface, command.paneKey)
  const unavailable = 'activity_context_menu_unavailable'
  const { trigger, owner, point, sourceMatches } = captureActivityThreadContextMenuSource(context)
  const menus = (): HTMLElement[] =>
    [...document.querySelectorAll<HTMLElement>('[data-activity-context-owner]')].filter(
      (node) => node.dataset.activityContextOwner === owner
    )
  const initialOpen = trigger.dataset.state === 'open'
  const initialMenus = menus()
  let ownedMenu: HTMLElement | null = initialMenus.length === 1 ? initialMenus[0] : null
  let snapshot: string[] = []
  let snapshotText: string | null = null
  const readMenu = (menu: HTMLElement): boolean => {
    if (
      menu.getAttribute('role') !== 'menu' ||
      menu.dataset.state !== 'open' ||
      menu.dataset.activityContextOwner !== owner ||
      menu.dataset.activityContextPane !== command.paneKey ||
      menu.dataset.activityContextWorkspace !== context.workspaceId ||
      !isActivityDestinationVisible(menu)
    ) {
      return false
    }
    const text = menu.dataset.activityContextTargets
    let keys: unknown
    try {
      keys = JSON.parse(text ?? 'null')
    } catch {
      return false
    }
    if (
      !Array.isArray(keys) ||
      !keys.every((key): key is string => typeof key === 'string' && key.length > 0) ||
      !keys.includes(command.paneKey) ||
      new Set(keys).size !== keys.length ||
      (snapshotText !== null && snapshotText !== text)
    ) {
      return false
    }
    snapshotText = text ?? null
    snapshot = keys
    return true
  }
  if (initialOpen ? !ownedMenu || !readMenu(ownedMenu) : initialMenus.length > 0) {
    throw new Error(unavailable)
  }
  const closeControl = ownedMenu ? readActivityContextMenuControl(ownedMenu) : null
  if (initialOpen && !command.enabled) {
    const active = document.activeElement
    const overlays = [
      ...document.querySelectorAll<HTMLElement>(
        '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-slot="popover-content"], [data-slot="sheet-content"]'
      )
    ]
    if (
      !ownedMenu ||
      !active ||
      !ownedMenu.contains(active) ||
      !closeControl?.isCurrent() ||
      overlays.some(
        (node) =>
          node !== ownedMenu && !ownedMenu?.contains(node) && isActivityDestinationVisible(node)
      )
    ) {
      throw new Error(unavailable)
    }
  }
  const sourceAncestors = new Set<HTMLElement>()
  for (let node: HTMLElement | null = trigger; node; node = node.parentElement) {
    sourceAncestors.add(node)
  }
  const visibilityAttributes = ['hidden', 'inert', 'aria-hidden', 'style', 'class']
  let invalidated = false
  let menuRemoved = false
  const observation = {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [
      'id',
      'role',
      'data-state',
      'data-slot',
      'data-activity-context-trigger',
      'data-activity-context-owner',
      'data-activity-context-pane',
      'data-activity-context-workspace',
      'data-activity-context-targets'
    ]
  }
  const recordChanges = (records: MutationRecord[]): void => {
    for (const record of records) {
      if (
        record.type === 'attributes' &&
        record.target instanceof HTMLElement &&
        sourceAncestors.has(record.target) &&
        visibilityAttributes.includes(record.attributeName ?? '')
      ) {
        invalidated = true
      }
      if (
        record.type === 'attributes' &&
        observation.attributeFilter.includes(record.attributeName ?? '') &&
        (record.target === trigger || record.target === ownedMenu)
      ) {
        if (
          record.attributeName !== 'data-state' ||
          record.oldValue === (command.enabled ? 'open' : 'closed')
        ) {
          invalidated = true
        }
      }
      if (record.type !== 'childList') {
        continue
      }
      for (const removed of record.removedNodes) {
        if (removed === trigger || removed.contains(trigger)) {
          invalidated = true
        }
        if (ownedMenu && (removed === ownedMenu || removed.contains(ownedMenu))) {
          menuRemoved = true
          if (command.enabled) {
            invalidated = true
          }
        }
      }
      for (const added of record.addedNodes) {
        const candidates =
          added instanceof HTMLElement
            ? [added, ...added.querySelectorAll<HTMLElement>('[data-activity-context-owner]')]
            : []
        for (const candidate of candidates) {
          if (candidate.dataset.activityContextOwner !== owner) {
            continue
          }
          if (menuRemoved || (ownedMenu && candidate !== ownedMenu)) {
            invalidated = true
          }
          if (!ownedMenu) {
            ownedMenu = candidate
            observer.observe(candidate, observation)
          }
        }
      }
    }
  }
  const observer = new MutationObserver(recordChanges)
  for (const node of [document.body, trigger, ownedMenu]) {
    if (node) {
      observer.observe(node, observation)
    }
  }
  for (const node of sourceAncestors) {
    observer.observe(
      node,
      node === trigger || node === document.body
        ? {
            ...observation,
            attributeFilter: [...observation.attributeFilter, ...visibilityAttributes]
          }
        : { attributes: true, attributeOldValue: true, attributeFilter: visibilityAttributes }
    )
  }
  const unsubscribe = useAppStore.subscribe(context.observe)
  let visible: boolean | null = null
  const inspect = (): boolean => {
    recordChanges(observer.takeRecords())
    context.observe()
    if (invalidated || !context.stillExpected() || !sourceMatches()) {
      return false
    }
    const current = menus()
    if (command.enabled) {
      if (current.length !== 1 || (ownedMenu && current[0] !== ownedMenu)) {
        return false
      }
      ownedMenu = current[0]
      visible = readMenu(ownedMenu)
      return visible && trigger.dataset.state === 'open'
    }
    visible = current.length > 0
    return !visible && trigger.dataset.state === 'closed' && (!ownedMenu || !ownedMenu.isConnected)
  }
  try {
    if (!context.stillExpected() || Date.now() >= request.expiresAt) {
      throw new Error(unavailable)
    }
    if (initialOpen !== command.enabled) {
      if (command.enabled) {
        const position = point()
        if (!position) {
          throw new Error(unavailable)
        }
        trigger.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: position.x,
            clientY: position.y
          })
        )
      } else {
        if (!closeControl?.isCurrent()) {
          throw new Error(unavailable)
        }
        closeControl.close()
      }
    }
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
      contextMenuAction: {
        paneKey: command.paneKey,
        enabled: command.enabled,
        visible,
        targetPaneKeys: snapshot
      },
      ...(!context.sameRuntime()
        ? { reason: 'viewer_runtime_changed' as const }
        : !context.stillOwned() || invalidated
          ? { reason: 'viewer_surface_superseded' as const }
          : !applied
            ? { reason: 'viewer_not_applied' as const }
            : {})
    }
  } finally {
    observer.disconnect()
    unsubscribe()
  }
}
