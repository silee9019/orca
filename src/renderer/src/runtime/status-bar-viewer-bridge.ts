import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { getStatusBarToggles } from '../components/settings/appearance-status-bar-search'
import { isStatusBarItemAvailable } from '../components/status-bar/status-bar-agent-gating'
import { recordStatusBarToggleInteraction } from '../components/status-bar/status-bar-toggle-interaction'
import { StatusBarViewerParams } from '../../../shared/rpc-contract/status-bar-viewer-params'
import type {
  StatusBarViewerRequest,
  StatusBarViewerResponse,
  StatusBarViewerResult
} from '../../../shared/status-bar-viewer-command'
import { readStatusBarViewerView, isStatusBarViewerMounted } from './status-bar-viewer-view'

export async function applyStatusBarViewerRequest(
  request: StatusBarViewerRequest
): Promise<Omit<StatusBarViewerResult, 'viewerId'>> {
  const command = StatusBarViewerParams.parse(request.command)
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
  if (command.operation !== 'get' && !window.api.ui.setWithAck) {
    throw new Error('persistence_ack_unavailable')
  }
  const availableItems = getStatusBarToggles()
    .filter((toggle) => isStatusBarItemAvailable(toggle.id, initial.detectedAgentIds))
    .map((toggle) => toggle.id)
  if (command.operation === 'item' && !availableItems.includes(command.item)) {
    throw new Error('status_bar_item_unavailable')
  }
  if (command.operation === 'item' && !window.api.ui.recordFeatureInteraction) {
    throw new Error('interaction_ack_unavailable')
  }
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const sameRuntime = (): boolean => {
    const settings = useAppStore.getState().settings
    return settings !== null && getProviderRuntimeContextKey(settings) === runtime
  }
  const interactionCounts = Object.fromEntries(
    Object.entries(initial.featureInteractions).map(([id, value]) => [id, value.interactionCount])
  )
  let dispatched = false
  let preferenceSaving: Promise<void> | undefined
  let interactionSaving: Promise<void> | void = undefined
  if (command.operation === 'toggle') {
    dispatched = true
    preferenceSaving = initial.setStatusBarVisible(!initial.statusBarVisible)
  } else if (command.operation === 'percentage') {
    dispatched = true
    preferenceSaving = initial.setUsagePercentageDisplay(command.display)
  } else if (
    command.operation === 'item' &&
    initial.statusBarItems.includes(command.item) !== command.enabled
  ) {
    dispatched = true
    interactionSaving = recordStatusBarToggleInteraction(
      command.item,
      initial.recordFeatureInteraction
    )
    preferenceSaving = initial.toggleStatusBarItem(command.item)
  }
  const expected = useAppStore.getState()
  const visible = expected.statusBarVisible
  const items = [...expected.statusBarItems]
  const percentageDisplay = expected.usagePercentageDisplay
  const percentageNoticeDismissed = expected.usagePercentageDisplayChangeNoticeDismissed
  const interactions = Object.entries(expected.featureInteractions).filter(
    ([id, value]) => value.interactionCount > (interactionCounts[id] ?? 0)
  )
  const sameItems = (values: readonly string[]): boolean =>
    values.length === items.length && items.every((item) => values.includes(item))
  const stillExpected = (): boolean => {
    const state = useAppStore.getState()
    return (
      sameRuntime() &&
      state.statusBarVisible === visible &&
      sameItems(state.statusBarItems) &&
      state.usagePercentageDisplay === percentageDisplay &&
      state.usagePercentageDisplayChangeNoticeDismissed === percentageNoticeDismissed
    )
  }
  const [preferenceOutcome, interactionOutcome] = await Promise.allSettled([
    preferenceSaving ?? Promise.resolve(),
    interactionSaving ?? Promise.resolve()
  ])
  const writes = {
    preference: !preferenceSaving
      ? ('not_requested' as const)
      : preferenceOutcome.status === 'fulfilled'
        ? ('accepted' as const)
        : ('rejected' as const),
    interaction: !interactionSaving
      ? ('not_requested' as const)
      : interactionOutcome.status === 'fulfilled'
        ? ('accepted' as const)
        : ('rejected' as const)
  }
  const writeFailed = writes.preference === 'rejected' || writes.interaction === 'rejected'
  let readFailed = false
  let persisted: boolean | null = null
  let interactionRecorded: boolean | null = command.operation === 'item' ? false : null
  if (sameRuntime()) {
    const ui = await window.api.ui.get().catch(() => {
      readFailed = true
      return null
    })
    if (ui && sameRuntime()) {
      interactionRecorded =
        command.operation === 'item' && interactions.length > 0
          ? interactions.every(
              ([id, value]) =>
                (ui.featureInteractions?.[id]?.interactionCount ?? 0) >= value.interactionCount
            )
          : interactionRecorded
      persisted =
        ui.statusBarVisible === visible &&
        sameItems(ui.statusBarItems) &&
        ui.usagePercentageDisplay === percentageDisplay &&
        ui.usagePercentageDisplayChangeNoticeDismissed === percentageNoticeDismissed &&
        (interactions.length === 0 || interactionRecorded === true)
      if (writeFailed) {
        persisted = false
        interactionRecorded = writes.interaction === 'rejected' ? false : interactionRecorded
      }
    }
  }
  if (writeFailed && sameRuntime()) {
    persisted = false
  }
  const matches = (): boolean => {
    const view = readStatusBarViewerView()
    if (
      command.operation === 'percentage' &&
      (!visible ||
        !view ||
        view.meters.length === 0 ||
        !view.meters.every((meter) => meter.display === percentageDisplay))
    ) {
      return false
    }
    return (
      stillExpected() &&
      (visible
        ? view !== null &&
          view.runtimeContextKey === runtime &&
          sameItems(view.items) &&
          view.percentageDisplay === percentageDisplay &&
          (command.operation !== 'percentage' ||
            (view.meters.length > 0 &&
              view.meters.every((meter) => meter.display === percentageDisplay)))
        : !isStatusBarViewerMounted())
    )
  }
  const deadline = Math.min(request.expiresAt - 100, Date.now() + 5000)
  while (stillExpected() && !matches() && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  const applied = Date.now() < request.expiresAt && matches()
  return {
    viewer: 'host',
    dispatched,
    applied,
    persisted,
    visible,
    items,
    availableItems,
    percentageDisplay,
    percentageNoticeDismissed,
    interactionRecorded,
    writes,
    rendered: sameRuntime() ? readStatusBarViewerView() : null,
    ...(!sameRuntime()
      ? { reason: 'viewer_runtime_changed' as const }
      : !stillExpected()
        ? { reason: 'viewer_surface_superseded' as const }
        : writeFailed
          ? { reason: 'persistence_failed' as const }
          : readFailed
            ? { reason: 'persistence_unverifiable' as const }
            : !persisted
              ? { reason: 'persistence_superseded' as const }
              : command.operation === 'percentage' &&
                  (readStatusBarViewerView()?.meters.length ?? 0) === 0
                ? { reason: 'status_bar_meter_unavailable' as const }
                : !applied
                  ? { reason: 'viewer_not_applied' as const }
                  : {})
  }
}

export type StatusBarViewerBridgeApi = {
  onStatusBarViewerRequest?: (callback: (request: StatusBarViewerRequest) => void) => () => void
  respondStatusBarViewer?: (response: StatusBarViewerResponse) => void
}
export function attachStatusBarViewerBridge(api: StatusBarViewerBridgeApi): () => void {
  if (!api.onStatusBarViewerRequest || !api.respondStatusBarViewer) {
    return () => {}
  }
  const respond = api.respondStatusBarViewer
  let queue = Promise.resolve()
  let disposed = false
  const unsubscribe = api.onStatusBarViewerRequest((request) => {
    queue = queue.then(async () => {
      if (disposed) {
        return
      }
      try {
        const result = await applyStatusBarViewerRequest(request)
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
