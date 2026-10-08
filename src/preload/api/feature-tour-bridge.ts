import { ipcRenderer } from 'electron'
import type { FeatureTourRequest, FeatureTourResponse } from '../../shared/feature-tour-command'
export const featureTourBridgeApi = {
  onFeatureTourRequest: (callback: (request: FeatureTourRequest) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: FeatureTourRequest): void =>
      callback(request)
    ipcRenderer.on('ui:featureTourViewerRequest', listener)
    return () => {
      ipcRenderer.removeListener('ui:featureTourViewerRequest', listener)
    }
  },
  respondFeatureTour: (response: FeatureTourResponse): void => {
    ipcRenderer.send('ui:featureTourViewerResponse', response)
  }
}
