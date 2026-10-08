import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { clampSidebarResizeWidth } from '@/hooks/useSidebarResize'
import {
  ACTIVITY_THREAD_LIST_MIN_WIDTH,
  ACTIVITY_THREAD_LIST_MAX_WIDTH
} from '../../../shared/activity-thread-list-layout'
import type {
  ActivityViewerRequest,
  ActivityViewerResult
} from '../../../shared/activity-viewer-command'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'
import { readActivityViewerView } from './activity-viewer-view'
import { isActivityDestinationVisible } from './activity-workspace-destination'

export async function applyActivityThreadListResizeRequest(
  request: ActivityViewerRequest,
  command: Extract<ActivityViewerCommand, { operation: 'resize' }>
): Promise<Omit<ActivityViewerResult, 'viewerId'>> {
  const dragStarted = (): boolean =>
    document.body.style.cursor === 'col-resize' && document.body.style.userSelect === 'none'
  const initial = useAppStore.getState()
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const root = document.querySelector<HTMLElement>('[data-activity-viewer="activity-page"]')
  const handle = root?.querySelector<HTMLElement>('[data-activity-list-resize]')
  const view = readActivityViewerView('activity-page')
  if (
    !root ||
    !handle ||
    !view ||
    view.runtimeContextKey !== runtime ||
    initial.activeView !== 'activity' ||
    !isActivityDestinationVisible(root) ||
    !isActivityDestinationVisible(handle) ||
    handle.dataset.activityListResizing === 'true' ||
    document.body.style.cursor !== '' ||
    document.body.style.userSelect !== ''
  ) {
    throw new Error('activity_resize_unavailable')
  }
  const targetWidth = clampSidebarResizeWidth(
    command.width,
    ACTIVITY_THREAD_LIST_MIN_WIDTH,
    ACTIVITY_THREAD_LIST_MAX_WIDTH
  )
  const bounds = root.getBoundingClientRect()
  const startX = Math.round(handle.getBoundingClientRect().left)
  const targetX = startX + targetWidth - bounds.width
  let superseded = false
  const sameRuntime = (): boolean => {
    const settings = useAppStore.getState().settings
    return settings !== null && getProviderRuntimeContextKey(settings) === runtime
  }
  const observe = (): void => {
    if (!sameRuntime() || useAppStore.getState().activeView !== 'activity') {
      superseded = true
    }
  }
  const stillExpected = (): boolean =>
    !superseded &&
    sameRuntime() &&
    document.querySelector('[data-activity-viewer="activity-page"]') === root &&
    root.querySelector('[data-activity-list-resize]') === handle &&
    isActivityDestinationVisible(root) &&
    isActivityDestinationVisible(handle)
  const matches = (): boolean =>
    stillExpected() &&
    Number(root.dataset.activityListWidth) === targetWidth &&
    Math.abs(root.getBoundingClientRect().width - targetWidth) < 1 &&
    handle.dataset.activityListResizing !== 'true' &&
    document.body.style.cursor === '' &&
    document.body.style.userSelect === ''
  const unsubscribe = useAppStore.subscribe(observe)
  try {
    try {
      handle.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          clientX: startX
        })
      )
      if (!dragStarted()) {
        throw new Error('activity_resize_not_started')
      }
      window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: targetX }))
    } finally {
      window.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: targetX }))
    }
    observe()
    const deadline = Math.min(request.expiresAt - 25, Date.now() + 5000)
    while (stillExpected() && !matches() && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    const applied = Date.now() < request.expiresAt && matches()
    return {
      viewer: 'host',
      surface: 'activity-page',
      dispatched: true,
      applied,
      persisted: null,
      writeOutcome: 'not_requested',
      groupBy: initial.agentsGroupBy,
      readFilter: initial.agentsReadFilter,
      compact: initial.agentsCompactMode,
      showChildAgents: initial.agentsShowChildAgents,
      rendered: sameRuntime() ? readActivityViewerView('activity-page') : null,
      resizeAction: {
        requestedWidth: command.width,
        targetWidth,
        renderedWidth: stillExpected() ? root.getBoundingClientRect().width : null
      },
      ...(!sameRuntime()
        ? { reason: 'viewer_runtime_changed' as const }
        : !stillExpected()
          ? { reason: 'viewer_surface_superseded' as const }
          : !applied
            ? { reason: 'viewer_not_applied' as const }
            : {})
    }
  } finally {
    unsubscribe()
  }
}
