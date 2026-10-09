import {
  OrcaYamlTrustViewerParams,
  type OrcaYamlTrustViewerCommand
} from '../../shared/rpc-contract/orca-yaml-trust-viewer-params'
import {
  OrcaYamlTrustViewerResultSchema,
  type OrcaYamlTrustViewerResult
} from '../../shared/orca-yaml-trust-viewer-command'
import {
  requestRendererCommand,
  type RendererCommandWindow
} from './renderer-command-request-relay'

export function requestOrcaYamlTrustViewerFromRenderer(
  window: RendererCommandWindow,
  command: OrcaYamlTrustViewerCommand
): Promise<OrcaYamlTrustViewerResult> {
  return requestRendererCommand(
    window,
    'orcaYamlTrustViewer',
    OrcaYamlTrustViewerParams.parse(command),
    OrcaYamlTrustViewerResultSchema,
    'renderer_timeout_applied_unknown'
  )
}
