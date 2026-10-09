import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { OrcaYamlTrustViewerParams } from '../../../shared/rpc-contract/orca-yaml-trust-viewer-params'
import type {
  OrcaYamlTrustSnapshot,
  OrcaYamlTrustViewerRequest,
  OrcaYamlTrustViewerResponse,
  OrcaYamlTrustViewerResult
} from '../../../shared/orca-yaml-trust-viewer-command'
import { attachHelpModalRequestQueue } from './help-modal-request-queue'
import { readOrcaYamlTrustControl, readOrcaYamlTrustView } from './orca-yaml-trust-viewer-view'

type Result = Omit<OrcaYamlTrustViewerResult, 'viewerId'>

export async function applyOrcaYamlTrustRequest(
  request: OrcaYamlTrustViewerRequest
): Promise<Result> {
  const command = OrcaYamlTrustViewerParams.parse(request.command)
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
  // Why: a trust dialog that was never mounted is the same as one that is closed.
  const current = (): OrcaYamlTrustSnapshot => {
    const view = readOrcaYamlTrustView()
    return view?.runtimeContextKey === runtime
      ? view
      : { runtimeContextKey: runtime, open: false, prompt: null }
  }
  if (command.operation === 'get') {
    const view = current()
    return {
      viewer: 'host',
      dispatched: false,
      applied: true,
      writeOutcome: 'not_requested',
      decision: null,
      prompt: view.prompt,
      open: view.open,
      rendered: view
    }
  }
  const before = current()
  const control = readOrcaYamlTrustControl()
  // Why: closeModal clears whatever modal is active, so a control that lags the active modal must not be called.
  const active = useAppStore.getState()
  if (
    !control ||
    !before.prompt ||
    active.activeModal !== 'confirm-orca-yaml-hooks' ||
    active.modalData.onResolve !== control.token
  ) {
    throw new Error('orca_yaml_trust_unavailable')
  }
  if (
    (command.repoId !== undefined && command.repoId !== before.prompt.repoId) ||
    (command.scriptKind !== undefined && command.scriptKind !== before.prompt.scriptKind)
  ) {
    throw new Error('orca_yaml_trust_mismatch')
  }
  const prompt = before.prompt
  control.skip()
  const stillShown = (): boolean =>
    current().open && readOrcaYamlTrustControl()?.token === control.token
  const deadline = Math.min(request.expiresAt - 100, Date.now() + 5000)
  while (sameRuntime() && stillShown() && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  const rendered = sameRuntime() ? current() : null
  const applied = sameRuntime() && Date.now() < request.expiresAt && !stillShown()
  const reason = !sameRuntime()
    ? ('viewer_runtime_changed' as const)
    : !applied
      ? ('orca_yaml_trust_still_open' as const)
      : undefined
  return {
    viewer: 'host',
    dispatched: true,
    applied,
    writeOutcome: 'not_requested',
    decision: 'skip',
    prompt,
    open: rendered?.open ?? false,
    rendered,
    ...(reason ? { reason } : {})
  }
}

export type OrcaYamlTrustViewerBridgeApi = {
  onOrcaYamlTrustViewerRequest?: (
    callback: (request: OrcaYamlTrustViewerRequest) => void
  ) => () => void
  respondOrcaYamlTrustViewer?: (response: OrcaYamlTrustViewerResponse) => void
}
export function attachOrcaYamlTrustViewerBridge(api: OrcaYamlTrustViewerBridgeApi): () => void {
  // Why: the queue serializes requests so a second CLI call sees the render the first one caused.
  return attachHelpModalRequestQueue<OrcaYamlTrustViewerRequest, Result>(
    api.onOrcaYamlTrustViewerRequest,
    api.respondOrcaYamlTrustViewer,
    (request) => applyOrcaYamlTrustRequest(request),
    () => true,
    () => 0
  )
}
