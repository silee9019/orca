import { ipcRenderer } from 'electron'
import type {
  OrcaYamlTrustViewerRequest,
  OrcaYamlTrustViewerResponse
} from '../../shared/orca-yaml-trust-viewer-command'

export const orcaYamlTrustViewerBridgeApi = {
  onOrcaYamlTrustViewerRequest: (
    callback: (request: OrcaYamlTrustViewerRequest) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      request: OrcaYamlTrustViewerRequest
    ): void => callback(request)
    ipcRenderer.on('ui:orcaYamlTrustViewerRequest', listener)
    return () => {
      ipcRenderer.removeListener('ui:orcaYamlTrustViewerRequest', listener)
    }
  },
  respondOrcaYamlTrustViewer: (response: OrcaYamlTrustViewerResponse): void => {
    ipcRenderer.send('ui:orcaYamlTrustViewerResponse', response)
  }
}
