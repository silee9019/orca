import { defineMethod } from '../core'
import { OrcaYamlTrustViewerParams } from '../../../../shared/rpc-contract/orca-yaml-trust-viewer-params'

export const ORCA_YAML_TRUST_VIEWER_METHODS = [
  defineMethod({
    name: 'ui.orcaYamlTrustViewer',
    params: OrcaYamlTrustViewerParams,
    handler: (params, { runtime }) => runtime.orcaYamlTrustViewer(params)
  })
]
