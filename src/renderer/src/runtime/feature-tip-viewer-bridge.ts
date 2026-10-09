import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import type { PersistedUIState } from '../../../shared/persisted-ui-state-types'
import { FeatureTipViewerParams } from '../../../shared/rpc-contract/feature-tip-viewer-params'
import type {
  FeatureTipSnapshot,
  FeatureTipViewerRequest,
  FeatureTipViewerResponse,
  FeatureTipViewerResult
} from '../../../shared/feature-tip-viewer-command'
import { attachHelpModalRequestQueue } from './help-modal-request-queue'
import { pollPersistedUi } from './persisted-ui-readback'
import { readFeatureTipControl, readFeatureTipView } from './feature-tip-viewer-view'

type Result = Omit<FeatureTipViewerResult, 'viewerId'>

export async function applyFeatureTipRequest(request: FeatureTipViewerRequest): Promise<Result> {
  const command = FeatureTipViewerParams.parse(request.command)
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
  // Why: a tip dialog that was never mounted is the same as one that is closed.
  const current = (): FeatureTipSnapshot => {
    const view = readFeatureTipView()
    return view?.runtimeContextKey === runtime
      ? view
      : { runtimeContextKey: runtime, open: false, tipId: null, action: null }
  }
  if (command.operation === 'get') {
    const view = current()
    return {
      viewer: 'host',
      dispatched: false,
      applied: true,
      persisted: null,
      writeOutcome: 'not_requested',
      tipId: view.tipId,
      open: view.open,
      rendered: view
    }
  }
  const before = current()
  const control = readFeatureTipControl()
  // Why: closeModal clears whatever modal is active, so a view that lags a newly opened modal must not be skipped.
  if (!control || !before.tipId || useAppStore.getState().activeModal !== 'feature-tips') {
    throw new Error('feature_tip_unavailable')
  }
  if (command.tipId && command.tipId !== before.tipId) {
    throw new Error('feature_tip_mismatch')
  }
  const tipId = before.tipId
  control.skip()
  const stillShown = (): boolean => {
    const view = current()
    return view.open && view.tipId === tipId
  }
  const deadline = Math.min(request.expiresAt - 100, Date.now() + 5000)
  const listsTip = (ui: PersistedUIState): boolean =>
    ui.featureTipsSeenIds?.some((id) => id === tipId) === true
  const polled = await pollPersistedUi({ matches: listsTip, keepWaiting: sameRuntime, deadline })
  const persisted = sameRuntime() && polled.ui !== null ? listsTip(polled.ui) : null
  while (sameRuntime() && stillShown() && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  const rendered = sameRuntime() ? current() : null
  const applied = sameRuntime() && Date.now() < request.expiresAt && !stillShown()
  const reason = !sameRuntime()
    ? ('viewer_runtime_changed' as const)
    : !applied
      ? ('feature_tip_still_open' as const)
      : persisted === null
        ? ('persistence_unverifiable' as const)
        : persisted === false
          ? ('persistence_superseded' as const)
          : undefined
  return {
    viewer: 'host',
    dispatched: true,
    applied,
    persisted,
    writeOutcome: 'unknown',
    tipId,
    open: rendered?.open ?? false,
    rendered,
    ...(reason ? { reason } : {})
  }
}

export type FeatureTipViewerBridgeApi = {
  onFeatureTipViewerRequest?: (callback: (request: FeatureTipViewerRequest) => void) => () => void
  respondFeatureTipViewer?: (response: FeatureTipViewerResponse) => void
}
export function attachFeatureTipViewerBridge(api: FeatureTipViewerBridgeApi): () => void {
  // Why: the queue serializes requests so a second CLI call sees the render the first one caused.
  return attachHelpModalRequestQueue<FeatureTipViewerRequest, Result>(
    api.onFeatureTipViewerRequest,
    api.respondFeatureTipViewer,
    (request) => applyFeatureTipRequest(request),
    () => true,
    () => 0
  )
}
