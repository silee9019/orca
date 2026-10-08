import { ipcRenderer } from 'electron'
import type {
  SidebarViewerRequest,
  SidebarViewerResponse
} from '../../shared/sidebar-viewer-command'

export const sidebarViewerBridgeApi = {
  onSidebarViewerRequest: (callback: (request: SidebarViewerRequest) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: SidebarViewerRequest): void =>
      callback(request)
    ipcRenderer.on('ui:sidebarViewerRequest', listener)
    return () => {
      ipcRenderer.removeListener('ui:sidebarViewerRequest', listener)
    }
  },
  respondSidebarViewer: (response: SidebarViewerResponse): void => {
    ipcRenderer.send('ui:sidebarViewerResponse', response)
  }
}
