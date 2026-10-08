import type { ActivityViewerSurface } from '../../../shared/rpc-contract/activity-viewer-params'
import type { ActivityViewerSnapshot } from '../../../shared/activity-viewer-command'
import type { ActivityThreadSelectionOutcome } from '@/components/activity/activity-thread-actions'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'

export type ActivityThreadReadCallbacks = {
  allThreads: readonly AgentPaneThread[]
  markRead: (thread: AgentPaneThread) => void
  markUnread: (thread: AgentPaneThread) => void
  markManyRead: (threads: readonly AgentPaneThread[]) => void
  markManyUnread: (threads: readonly AgentPaneThread[]) => void
  canMarkUnread: (thread: AgentPaneThread) => boolean
}
export type ActivityThreadReadControl = ActivityThreadReadCallbacks & {
  visibleThreads: readonly AgentPaneThread[]
}

export type ActivityNavigationControl = {
  visibleThreads: readonly AgentPaneThread[]
  select?: (thread: AgentPaneThread) => ActivityThreadSelectionOutcome | void
  jump: (thread: AgentPaneThread) => boolean | void
  canJump: (thread: AgentPaneThread) => boolean
}

export type ActivityCompletedControl = {
  run: () => void
  hasCompletedThreads: boolean
  visibleThreads: readonly AgentPaneThread[]
  allThreads: readonly AgentPaneThread[]
}

const committed: Partial<
  Record<
    ActivityViewerSurface,
    {
      view: ActivityViewerSnapshot
      controls?: {
        markAllRead?: () => void
        threadReads?: ActivityThreadReadControl
        completed?: ActivityCompletedControl
        navigation?: ActivityNavigationControl
      }
    }
  >
> = {}
export function publishActivityViewerView(
  surface: ActivityViewerSurface,
  view: ActivityViewerSnapshot | null,
  controls?: {
    markAllRead?: () => void
    threadReads?: ActivityThreadReadControl
    completed?: ActivityCompletedControl
    navigation?: ActivityNavigationControl
  }
): void {
  if (view) {
    committed[surface] = { view, controls }
  } else {
    delete committed[surface]
  }
}
export function readActivityViewerView(
  surface: ActivityViewerSurface
): ActivityViewerSnapshot | null {
  const view = committed[surface]?.view
  const root = document.querySelector<HTMLElement>(`[data-activity-viewer="${surface}"]`)
  if (!view || !root) {
    return null
  }
  const bounds = root.getBoundingClientRect()
  const sidebar = root.closest<HTMLElement>('[data-viewer-sidebar="left"]')
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    (sidebar && sidebar.getBoundingClientRect().width <= 0)
  ) {
    return null
  }
  const keys = new Set(
    view.logicalRows.filter((row) => row.kind === 'thread').map((row) => row.key)
  )
  const renderedRows = [
    ...root.querySelectorAll<HTMLElement>('[data-activity-viewer-thread]')
  ].flatMap((row) => {
    const key = row.getAttribute('data-activity-viewer-thread')
    const height = row.getBoundingClientRect().height
    return key && keys.has(key) && Number.isFinite(height) && height > 0 ? [{ key, height }] : []
  })
  return {
    ...view,
    densityMeasured: root.getAttribute('data-activity-density-measured') === String(view.compact),
    renderedRows
  }
}

export function readActivityMarkAllReadControl(surface: ActivityViewerSurface): {
  markAllRead: () => void
  hasUnreadThreads: boolean
} | null {
  const entry = committed[surface]
  return entry?.controls?.markAllRead && typeof entry.view.hasUnreadThreads === 'boolean'
    ? { markAllRead: entry.controls.markAllRead, hasUnreadThreads: entry.view.hasUnreadThreads }
    : null
}

export function readActivityThreadReadControl(
  surface: ActivityViewerSurface
): ActivityThreadReadControl | null {
  return committed[surface]?.controls?.threadReads ?? null
}

export function readActivityCompletedControl(
  surface: ActivityViewerSurface
): ActivityCompletedControl | null {
  return committed[surface]?.controls?.completed ?? null
}

export function readActivityNavigationControl(
  surface: ActivityViewerSurface
): ActivityNavigationControl | null {
  return committed[surface]?.controls?.navigation ?? null
}
