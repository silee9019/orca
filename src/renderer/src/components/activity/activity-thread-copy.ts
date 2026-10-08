import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { activityThreadRowCopy } from './activity-thread-presentation'
import type { AgentPaneThread } from './activity-thread-types'

export type ActivityThreadCopyTarget = { key: string; label: string; value: string }

export function getActivityThreadCopyTargets(
  thread: AgentPaneThread,
  hasWorkspace: boolean
): ActivityThreadCopyTarget[] {
  const title: ActivityThreadCopyTarget = {
    key: 'title',
    label: translate('auto.components.activity.ActivityThreadContextMenu.copyTitle', 'Copy Title'),
    value: activityThreadRowCopy(thread).taskTitle
  }
  // Why gated: synthetic floating/standalone worktrees have no path.
  if (!hasWorkspace || !thread.worktree.path) {
    return [title]
  }
  const path: ActivityThreadCopyTarget = {
    key: 'path',
    label: translate('auto.components.activity.ActivityThreadContextMenu.copyPath', 'Copy Path'),
    value: thread.worktree.path
  }
  // Same order as the workspace menu: Copy Path, then the name.
  return [path, title]
}

export function writeActivityThreadCopyTarget(target: ActivityThreadCopyTarget): Promise<void> {
  return window.api.ui.writeClipboardText(target.value)
}

export async function copyActivityThreadPreviewPath(path: string): Promise<boolean> {
  if (!path) {
    return false
  }
  try {
    await window.api.ui.writeClipboardText(path)
    toast.success(
      translate(
        'auto.components.activity.ActivityThreadHoverCard.pathCopied',
        'Path copied to clipboard'
      )
    )
    return true
  } catch {
    toast.error(
      translate(
        'auto.components.activity.ActivityThreadHoverCard.copyPathFailed',
        'Failed to copy path'
      )
    )
    return false
  }
}

export async function copyActivityLinkedWorkItemLink(url: string, label: string): Promise<boolean> {
  try {
    await window.api.ui.writeClipboardText(url)
    toast.success(
      translate('auto.components.sidebar.WorktreeCardMeta.copyLinkSuccess', '{{value0}} copied', {
        value0: label
      })
    )
    return true
  } catch {
    toast.error(
      translate('auto.components.sidebar.WorktreeCardMeta.copyLinkFailure', 'Failed to copy link')
    )
    return false
  }
}
