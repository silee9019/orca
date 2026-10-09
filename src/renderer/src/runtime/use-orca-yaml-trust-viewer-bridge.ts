import { useEffect } from 'react'
import { attachOrcaYamlTrustViewerBridge } from './orca-yaml-trust-viewer-bridge'
export function useOrcaYamlTrustViewerBridge(): void {
  useEffect(() => attachOrcaYamlTrustViewerBridge(window.api.ui), [])
}
