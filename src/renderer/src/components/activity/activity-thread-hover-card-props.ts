import type React from 'react'
import type { AgentPaneThread } from './activity-thread-types'
import type { useWorktreeCardDetailsHoverControl } from '../sidebar/worktree-card-details-hover-state'

export type ActivityThreadHoverCardProps = {
  thread: AgentPaneThread
  children: React.ReactElement
  openDelay?: number
  closeDelay?: number
  onJumpToWorkspace?: (thread: AgentPaneThread) => void
  canJumpToWorkspace?: boolean
  /** Keeps the preview closed, e.g. while the row's right-click menu covers it. */
  suppressed?: boolean
}

export type ActivityThreadHoverCardContentProps = {
  thread: AgentPaneThread
  previewId: string
  detailsHoverControl: ReturnType<typeof useWorktreeCardDetailsHoverControl>
  onJumpToWorkspace?: (thread: AgentPaneThread) => void
  canJumpToWorkspace?: boolean
}
