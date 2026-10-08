import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import {
  WorkspaceBoardParams,
  type WorkspaceBoardCommand
} from '../../../shared/rpc-contract/workspace-board-params'
import type {
  WorkspaceBoardRequest,
  WorkspaceBoardResponse,
  WorkspaceBoardResult,
  WorkspaceBoardSnapshot
} from '../../../shared/workspace-board-command'
import { attachHelpModalRequestQueue } from './help-modal-request-queue'
import { pollPersistedUi } from './persisted-ui-readback'
import {
  readWorkspaceBoardControl,
  readWorkspaceBoardView,
  type WorkspaceBoardControl
} from './workspace-board-viewer-view'

type BoardStatus = WorkspaceBoardSnapshot['statuses'][number]

function sameStatuses(a: readonly BoardStatus[], b: readonly BoardStatus[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (status, index) =>
        status.id === b[index].id &&
        status.label === b[index].label &&
        status.color === b[index].color &&
        status.icon === b[index].icon
    )
  )
}

function dispatchBoardCommand(
  command: WorkspaceBoardCommand,
  statuses: readonly BoardStatus[],
  control: WorkspaceBoardControl
): void {
  if (command.operation === 'get') {
    return
  }
  if (command.operation === 'status-add') {
    control.addStatus()
    return
  }
  if (command.operation === 'column-width') {
    control.setColumnWidth(command.width)
    return
  }
  const index = statuses.findIndex((status) => status.id === command.statusId)
  if (index === -1) {
    throw new Error('workspace_status_unavailable')
  }
  if (command.operation === 'status-rename') {
    control.renameStatus(command.statusId, command.label)
  } else if (command.operation === 'status-color') {
    control.changeStatusColor(command.statusId, command.color)
  } else if (command.operation === 'status-icon') {
    control.changeStatusIcon(command.statusId, command.icon)
  } else if (command.operation === 'status-move') {
    const direction = command.direction === 'left' ? -1 : 1
    const target = index + direction
    // Why: the board disables the move button at either end and ignores the click.
    if (target < 0 || target >= statuses.length) {
      throw new Error('workspace_status_action_unavailable')
    }
    control.moveStatus(command.statusId, direction)
  } else {
    // Why: the board never removes its last status.
    if (statuses.length <= 1) {
      throw new Error('workspace_status_action_unavailable')
    }
    control.removeStatus(command.statusId)
  }
}

export async function applyWorkspaceBoardRequest(
  request: WorkspaceBoardRequest
): Promise<Omit<WorkspaceBoardResult, 'viewerId'>> {
  const command = WorkspaceBoardParams.parse(request.command)
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const initial = useAppStore.getState()
  if (!initial.persistedUIReady || !initial.settings) {
    throw new Error('viewer_not_ready')
  }
  if (initial.settings.activeRuntimeEnvironmentId) {
    throw new Error('viewer_runtime_mismatch')
  }
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const sameRuntime = (): boolean => {
    const settings = useAppStore.getState().settings
    return settings !== null && getProviderRuntimeContextKey(settings) === runtime
  }
  const boardMatchesStore = (view: WorkspaceBoardSnapshot | null): boolean => {
    const state = useAppStore.getState()
    return (
      view !== null &&
      view.open &&
      view.runtimeContextKey === runtime &&
      sameStatuses(view.statuses, state.workspaceStatuses) &&
      view.columnWidth === state.workspaceBoardColumnWidth
    )
  }
  let dispatched = false
  if (command.operation !== 'get') {
    // Why: the board's handlers close over its last render, so wait for it to catch up with the store first.
    const settleDeadline = Math.min(request.expiresAt - 5000, Date.now() + 1000)
    while (
      readWorkspaceBoardView() !== null &&
      !boardMatchesStore(readWorkspaceBoardView()) &&
      Date.now() < settleDeadline
    ) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    const view = readWorkspaceBoardView()
    const control = readWorkspaceBoardControl()
    if (!view || !control || !boardMatchesStore(view)) {
      throw new Error('workspace_board_unavailable')
    }
    dispatchBoardCommand(command, view.statuses, control)
    dispatched = true
  }
  const expected = useAppStore.getState()
  const statuses = expected.workspaceStatuses.map((status) => ({ ...status }))
  const columnWidth = expected.workspaceBoardColumnWidth
  const stillExpected = (): boolean => {
    const state = useAppStore.getState()
    return (
      sameRuntime() &&
      sameStatuses(state.workspaceStatuses, statuses) &&
      state.workspaceBoardColumnWidth === columnWidth
    )
  }
  const matches = (): boolean => stillExpected() && boardMatchesStore(readWorkspaceBoardView())
  const persistedMatches =
    command.operation === 'column-width'
      ? (ui: { workspaceBoardColumnWidth?: number }) => ui.workspaceBoardColumnWidth === columnWidth
      : (ui: { workspaceStatuses?: BoardStatus[] }) =>
          sameStatuses(ui.workspaceStatuses ?? [], statuses)
  const persistenceDeadline = Math.min(request.expiresAt - 100, Date.now() + 5000)
  let persisted: boolean | null = null
  if (command.operation !== 'get') {
    const polled = await pollPersistedUi({
      matches: persistedMatches,
      keepWaiting: stillExpected,
      deadline: persistenceDeadline
    })
    persisted = sameRuntime() && polled.ui !== null ? persistedMatches(polled.ui) : null
  }
  const viewDeadline = Math.min(request.expiresAt - 25, Date.now() + 5000)
  while (
    stillExpected() &&
    readWorkspaceBoardView() !== null &&
    !matches() &&
    Date.now() < viewDeadline
  ) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  const rendered = sameRuntime() ? readWorkspaceBoardView() : null
  const applied = Date.now() < request.expiresAt && matches()
  const reason = !sameRuntime()
    ? ('viewer_runtime_changed' as const)
    : !stillExpected()
      ? ('viewer_surface_superseded' as const)
      : command.operation !== 'get' && persisted === null
        ? ('persistence_unverifiable' as const)
        : persisted === false
          ? ('persistence_superseded' as const)
          : !rendered
            ? ('workspace_board_unavailable' as const)
            : !applied
              ? ('viewer_not_applied' as const)
              : undefined
  return {
    viewer: 'host',
    dispatched,
    applied,
    persisted,
    writeOutcome: dispatched ? 'unknown' : 'not_requested',
    reassignment: dispatched && command.operation === 'status-remove' ? 'unknown' : 'not_requested',
    statuses,
    columnWidth,
    rendered,
    ...(reason ? { reason } : {})
  }
}

export type WorkspaceBoardViewerBridgeApi = {
  onWorkspaceBoardRequest?: (callback: (request: WorkspaceBoardRequest) => void) => () => void
  respondWorkspaceBoard?: (response: WorkspaceBoardResponse) => void
}
export function attachWorkspaceBoardViewerBridge(api: WorkspaceBoardViewerBridgeApi): () => void {
  // Why: the queue serializes requests so a second CLI call sees the render the first one caused.
  return attachHelpModalRequestQueue<WorkspaceBoardRequest, Omit<WorkspaceBoardResult, 'viewerId'>>(
    api.onWorkspaceBoardRequest,
    api.respondWorkspaceBoard,
    (request) => applyWorkspaceBoardRequest(request),
    () => true,
    () => 0
  )
}
