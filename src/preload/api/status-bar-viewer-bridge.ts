import { ipcRenderer } from 'electron'
import type {
  StatusBarViewerRequest,
  StatusBarViewerResponse
} from '../../shared/status-bar-viewer-command'

export const statusBarViewerBridgeApi = {
  onStatusBarViewerRequest: (callback: (request: StatusBarViewerRequest) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: StatusBarViewerRequest): void =>
      callback(request)
    ipcRenderer.on('ui:statusBarViewerRequest', listener)
    return () => {
      ipcRenderer.removeListener('ui:statusBarViewerRequest', listener)
    }
  },
  respondStatusBarViewer: (response: StatusBarViewerResponse): void => {
    ipcRenderer.send('ui:statusBarViewerResponse', response)
  }
}
