import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { dispatchAppCommand } from '@/lib/app-command-dispatch'
import { SidebarViewerParams } from '../../../shared/rpc-contract/sidebar-viewer-params'
import type {
  SidebarViewerRequest,
  SidebarViewerResult,
  SidebarViewerResponse,
  SidebarViewerSnapshot
} from '../../../shared/sidebar-viewer-command'
import { readSidebarViewerView, waitForSidebarViewerView } from './sidebar-viewer-view'

const panelActions = {
  files: 'sidebar.explorer.toggle',
  search: 'sidebar.search.toggle',
  'source-control': 'sidebar.sourceControl.toggle',
  checks: 'sidebar.checks.toggle',
  ports: 'sidebar.ports.toggle'
} as const
export async function applySidebarViewerRequest(
  request: SidebarViewerRequest
): Promise<Omit<SidebarViewerResult, 'viewerId'>> {
  const command = SidebarViewerParams.parse(request.command)
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const initial = useAppStore.getState()
  if (!initial.settings || !initial.persistedUIReady) {
    throw new Error('viewer_not_ready')
  }
  if (initial.settings.activeRuntimeEnvironmentId) {
    throw new Error('viewer_runtime_mismatch')
  }
  const runtimeContextKey = getProviderRuntimeContextKey(initial.settings)
  const activeWorktreeId = initial.activeWorktreeId
  if (command.operation !== 'get') {
    const rendered = readSidebarViewerView()
    if (command.operation === 'toggle' && command.side === 'left' && !rendered.leftMounted) {
      throw new Error('sidebar_surface_unavailable')
    }
    if (
      command.operation === 'open-panel' &&
      !rendered.availablePanels.includes(
        command.panel === 'files' || command.panel === 'search' ? 'explorer' : command.panel
      )
    ) {
      throw new Error('sidebar_panel_unavailable')
    }
    const action =
      command.operation === 'toggle'
        ? command.side === 'left'
          ? 'sidebar.left.toggle'
          : 'sidebar.right.toggle'
        : panelActions[command.panel]
    if (!dispatchAppCommand(action, 'cli')) {
      throw new Error('sidebar_command_unavailable')
    }
  }
  const expected = useAppStore.getState()
  const sidebarOpen = expected.sidebarOpen
  const rightSidebarOpen = expected.rightSidebarOpen
  const rightSidebarTab = expected.rightSidebarTab
  const explorerView = expected.rightSidebarExplorerView
  const stillExpected = (): boolean => {
    const current = useAppStore.getState()
    if (!current.settings || getProviderRuntimeContextKey(current.settings) !== runtimeContextKey) {
      return false
    }
    if (command.operation === 'get') {
      return true
    }
    if (command.operation === 'open-panel' && current.activeWorktreeId !== activeWorktreeId) {
      return false
    }
    if (command.operation === 'toggle') {
      return command.side === 'left'
        ? current.sidebarOpen === sidebarOpen
        : current.rightSidebarOpen === rightSidebarOpen
    }
    return (
      current.rightSidebarOpen === rightSidebarOpen &&
      current.rightSidebarTab === rightSidebarTab &&
      (rightSidebarTab !== 'explorer' || current.rightSidebarExplorerView === explorerView)
    )
  }
  const matches = (view: SidebarViewerSnapshot): boolean => {
    if (!stillExpected()) {
      return false
    }
    if (command.operation === 'get') {
      return true
    }
    if (command.operation === 'toggle') {
      return command.side === 'left'
        ? view.leftMounted && view.leftVisible === sidebarOpen
        : view.rightMounted && view.rightVisible === rightSidebarOpen
    }
    return (
      view.rightVisible &&
      view.panelReady &&
      view.panel === rightSidebarTab &&
      (rightSidebarTab !== 'explorer' || view.explorerView === explorerView)
    )
  }
  const reached =
    command.operation === 'get' || (await waitForSidebarViewerView(matches, request.expiresAt))
  const latest = useAppStore.getState()
  const sameRuntime =
    latest.settings !== null && getProviderRuntimeContextKey(latest.settings) === runtimeContextKey
  const rendered = sameRuntime
    ? readSidebarViewerView()
    : {
        leftMounted: false,
        leftVisible: false,
        rightMounted: false,
        rightVisible: false,
        panel: null,
        explorerView: null,
        panelReady: false,
        availablePanels: []
      }
  const applied = reached && sameRuntime && Date.now() < request.expiresAt && matches(rendered)
  return {
    viewer: 'host',
    dispatched: command.operation !== 'get',
    applied,
    persisted: null,
    sidebarOpen: sameRuntime ? latest.sidebarOpen : sidebarOpen,
    rightSidebarOpen: sameRuntime ? latest.rightSidebarOpen : rightSidebarOpen,
    rightSidebarTab: sameRuntime ? latest.rightSidebarTab : rightSidebarTab,
    explorerView: sameRuntime ? latest.rightSidebarExplorerView : explorerView,
    rendered,
    ...(!sameRuntime
      ? { reason: 'viewer_runtime_changed' as const }
      : !stillExpected()
        ? { reason: 'viewer_surface_superseded' as const }
        : !applied
          ? { reason: 'viewer_not_applied' as const }
          : {})
  }
}

export type SidebarViewerBridgeApi = {
  onSidebarViewerRequest?: (callback: (request: SidebarViewerRequest) => void) => () => void
  respondSidebarViewer?: (response: SidebarViewerResponse) => void
}
export function attachSidebarViewerBridge(api: SidebarViewerBridgeApi): () => void {
  if (!api.onSidebarViewerRequest || !api.respondSidebarViewer) {
    return () => {}
  }
  const respond = api.respondSidebarViewer
  let queue = Promise.resolve()
  let disposed = false
  const unsubscribe = api.onSidebarViewerRequest((request) => {
    queue = queue.then(async () => {
      if (disposed) {
        return
      }
      try {
        const result = await applySidebarViewerRequest(request)
        if (!disposed) {
          respond({ id: request.id, ok: true, result: { ...result, viewerId: 0 } })
        }
      } catch (error) {
        if (!disposed) {
          respond({
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : 'viewer_operation_failed'
          })
        }
      }
    })
  })
  return () => {
    disposed = true
    unsubscribe()
  }
}
