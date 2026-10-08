import { publishActivityContextMenuControl } from '@/runtime/activity-context-menu-controls'
import React from 'react'
import { getActivityThreadReadTargets } from './activity-thread-read-targets'
import { Bell, BellOff, Copy, ExternalLink, PanelRight, X } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/lib/close-all-context-menus'
import {
  clearActivityThread,
  clearCompletedActivity,
  isClearableActivityThread
} from './activity-clear-completed'
import { getActivityThreadCopyTargets, writeActivityThreadCopyTarget } from './activity-thread-copy'
export { getActivityThreadCopyTargets } from './activity-thread-copy'
import type { AgentPaneThread } from './activity-thread-types'

/** Right-click actions for an activity row; mirrors the row's own click and hover actions. */
export function ActivityThreadContextMenu({
  thread,
  canJump,
  canMarkUnread,
  getTargets,
  onOpen,
  onJump,
  onMarkRead,
  onMarkUnread,
  onMarkManyRead,
  onMarkManyUnread,
  children
}: {
  thread: AgentPaneThread
  canJump: boolean
  canMarkUnread: (thread: AgentPaneThread) => boolean
  /** Called as the menu opens; returns every agent the menu should act on. */
  getTargets?: (thread: AgentPaneThread) => readonly AgentPaneThread[]
  onOpen: (thread: AgentPaneThread) => void
  onJump: (thread: AgentPaneThread) => void
  onMarkRead: (thread: AgentPaneThread) => void
  onMarkUnread: (thread: AgentPaneThread) => void
  onMarkManyRead: (threads: readonly AgentPaneThread[]) => void
  onMarkManyUnread: (threads: readonly AgentPaneThread[]) => void
  /** Receives whether the menu is open, so the row can keep its preview out of the way. */
  children: (menuOpen: boolean) => React.ReactElement
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const owner = React.useId()
  const closeRef = React.useRef<() => void>(() => {})
  const cleanup = React.useRef<(() => void) | null>(null)
  const menuRef = React.useCallback((menu: HTMLDivElement | null): void => {
    cleanup.current?.()
    cleanup.current = menu
      ? publishActivityContextMenuControl(menu, () => closeRef.current())
      : null
  }, [])
  // Why a snapshot: the pointerdown on a portaled item clears the list selection before onSelect.
  const [targets, setTargets] = React.useState<readonly AgentPaneThread[]>([thread])

  React.useEffect(() => {
    if (!menuOpen) {
      return
    }
    const closeMenu = (): void => setMenuOpen(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [menuOpen])

  const handleOpenChange = (open: boolean): void => {
    if (open) {
      window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
      setTargets(getTargets?.(thread) ?? [thread])
    }
    setMenuOpen(open)
  }

  closeRef.current = () => handleOpenChange(false)

  return (
    <ContextMenu open={menuOpen} onOpenChange={handleOpenChange}>
      <ContextMenuTrigger
        asChild
        data-activity-context-trigger={owner}
        data-activity-context-pane={thread.paneKey}
        data-activity-context-workspace={thread.worktree.id}
      >
        {children(menuOpen)}
      </ContextMenuTrigger>
      {/* Why no focus restore: refocusing the row would reopen its hover preview and pin it open. */}
      <ContextMenuContent
        ref={menuRef}
        data-activity-context-owner={owner}
        data-activity-context-pane={thread.paneKey}
        data-activity-context-workspace={thread.worktree.id}
        data-activity-context-targets={JSON.stringify(targets.map((target) => target.paneKey))}
        className="w-52"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <ContextMenuLabel>
          {translate('auto.components.activity.ActivityThreadContextMenu.agentSection', 'Agent')}
        </ContextMenuLabel>
        {targets.length > 1 ? (
          <ActivityThreadBulkMenuItems
            targets={targets}
            canMarkUnread={canMarkUnread}
            onMarkManyRead={onMarkManyRead}
            onMarkManyUnread={onMarkManyUnread}
          />
        ) : (
          <ActivityThreadSingleMenuItems
            thread={thread}
            canJump={canJump}
            canMarkUnread={canMarkUnread(thread)}
            onOpen={onOpen}
            onJump={onJump}
            onMarkRead={onMarkRead}
            onMarkUnread={onMarkUnread}
          />
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function ActivityThreadSingleMenuItems({
  thread,
  canJump,
  canMarkUnread,
  onOpen,
  onJump,
  onMarkRead,
  onMarkUnread
}: {
  thread: AgentPaneThread
  canJump: boolean
  canMarkUnread: boolean
  onOpen: (thread: AgentPaneThread) => void
  onJump: (thread: AgentPaneThread) => void
  onMarkRead: (thread: AgentPaneThread) => void
  onMarkUnread: (thread: AgentPaneThread) => void
}): React.JSX.Element {
  return (
    <>
      <ContextMenuItem onSelect={() => onOpen(thread)}>
        <PanelRight className="size-3.5" />
        {translate('auto.components.activity.ActivityThreadContextMenu.open', 'Open')}
      </ContextMenuItem>
      {canJump ? (
        <ContextMenuItem onSelect={() => onJump(thread)}>
          <ExternalLink className="size-3.5" />
          {translate(
            'auto.components.activity.ActivityThreadContextMenu.goToWorkspace',
            'Go to Workspace'
          )}
        </ContextMenuItem>
      ) : null}
      <ContextMenuSeparator />
      {getActivityThreadCopyTargets(thread, canJump).map((target) => (
        <ContextMenuItem
          key={target.key}
          data-activity-copy-kind={target.key}
          onSelect={() => void writeActivityThreadCopyTarget(target)}
        >
          <Copy className="size-3.5" />
          {target.label}
        </ContextMenuItem>
      ))}
      <ContextMenuSeparator />
      <ContextMenuItem
        disabled={!thread.unread && !canMarkUnread}
        onSelect={() => (thread.unread ? onMarkRead(thread) : onMarkUnread(thread))}
      >
        {thread.unread ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />}
        {thread.unread
          ? translate('auto.components.activity.ActivityThreadContextMenu.markRead', 'Mark Read')
          : translate(
              'auto.components.activity.ActivityThreadContextMenu.markUnread',
              'Mark Unread'
            )}
      </ContextMenuItem>
      {isClearableActivityThread(thread) ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => clearActivityThread(thread)}>
            <X className="size-3.5" />
            {translate(
              'auto.components.activity.ActivityThreadContextMenu.clear',
              'Clear from List'
            )}
          </ContextMenuItem>
        </>
      ) : null}
    </>
  )
}

// Single-agent actions (Open, Go to Workspace, Copy) are hidden, as in the workspace menu.
function ActivityThreadBulkMenuItems({
  targets,
  canMarkUnread,
  onMarkManyRead,
  onMarkManyUnread
}: {
  targets: readonly AgentPaneThread[]
  canMarkUnread: (thread: AgentPaneThread) => boolean
  onMarkManyRead: (threads: readonly AgentPaneThread[]) => void
  onMarkManyUnread: (threads: readonly AgentPaneThread[]) => void
}): React.JSX.Element {
  const readAction = getActivityThreadReadTargets(targets, canMarkUnread)
  const clearable = targets.filter(isClearableActivityThread)
  return (
    <>
      {/* Why read wins when mixed: matches the single toggle, which offers Mark Read on any unread agent. */}
      {readAction.operation === 'read' ? (
        <ContextMenuItem onSelect={() => onMarkManyRead(readAction.targets)}>
          <BellOff className="size-3.5" />
          {translate(
            'auto.components.activity.ActivityThreadContextMenu.markManyRead',
            'Mark {{count}} Agents Read',
            { count: readAction.targets.length }
          )}
        </ContextMenuItem>
      ) : (
        <ContextMenuItem
          disabled={readAction.targets.length === 0}
          onSelect={() => onMarkManyUnread(readAction.targets)}
        >
          <Bell className="size-3.5" />
          {readAction.targets.length > 0
            ? translate(
                'auto.components.activity.ActivityThreadContextMenu.markManyUnread',
                'Mark {{count}} Agents Unread',
                { count: readAction.targets.length }
              )
            : translate(
                'auto.components.activity.ActivityThreadContextMenu.markUnread',
                'Mark Unread'
              )}
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        disabled={clearable.length === 0}
        onSelect={() => clearCompletedActivity(clearable)}
      >
        <X className="size-3.5" />
        {clearable.length > 0
          ? translate(
              'auto.components.activity.ActivityThreadContextMenu.clearMany',
              'Clear {{count}} Agents from List',
              { count: clearable.length }
            )
          : translate(
              'auto.components.activity.ActivityThreadContextMenu.clear',
              'Clear from List'
            )}
      </ContextMenuItem>
    </>
  )
}
