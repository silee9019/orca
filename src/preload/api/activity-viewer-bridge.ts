import { ipcRenderer } from 'electron'
import type {
  ActivityViewerRequest,
  ActivityViewerResponse
} from '../../shared/activity-viewer-command'

export const activityViewerBridgeApi = {
  onActivityViewerRequest: (callback: (request: ActivityViewerRequest) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: ActivityViewerRequest): void =>
      callback(request)
    ipcRenderer.on('ui:activityViewerRequest', listener)
    return () => {
      ipcRenderer.removeListener('ui:activityViewerRequest', listener)
    }
  },
  respondActivityViewer: (response: ActivityViewerResponse): void => {
    ipcRenderer.send('ui:activityViewerResponse', response)
  }
}
