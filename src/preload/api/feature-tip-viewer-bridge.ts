import { ipcRenderer } from 'electron'
import type {
  FeatureTipViewerRequest,
  FeatureTipViewerResponse
} from '../../shared/feature-tip-viewer-command'

export const featureTipViewerBridgeApi = {
  onFeatureTipViewerRequest: (
    callback: (request: FeatureTipViewerRequest) => void
  ): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: FeatureTipViewerRequest): void =>
      callback(request)
    ipcRenderer.on('ui:featureTipViewerRequest', listener)
    return () => {
      ipcRenderer.removeListener('ui:featureTipViewerRequest', listener)
    }
  },
  respondFeatureTipViewer: (response: FeatureTipViewerResponse): void => {
    ipcRenderer.send('ui:featureTipViewerResponse', response)
  }
}
