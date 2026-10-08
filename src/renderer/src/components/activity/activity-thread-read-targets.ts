import type { AgentPaneThread } from './activity-thread-types'

export function getActivityThreadReadTargets<T extends Pick<AgentPaneThread, 'paneKey' | 'unread'>>(
  targets: readonly T[],
  canMarkUnread: (thread: T) => boolean
): { operation: 'read' | 'unread'; targets: T[] } {
  const unread = targets.filter((target) => target.unread)
  const read = targets.filter((target) => !target.unread && canMarkUnread(target))
  return unread.length > 0
    ? { operation: 'read', targets: unread }
    : { operation: 'unread', targets: read }
}
