import { ipcRenderer } from 'electron'
import type {
  WorkspaceListViewerRequest,
  WorkspaceListViewerResponse
} from '../../shared/workspace-list-viewer-command'

export const workspaceListViewerBridgeApi = {
  onWorkspaceListViewerRequest: (
    callback: (request: WorkspaceListViewerRequest) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      request: WorkspaceListViewerRequest
    ): void => callback(request)
    ipcRenderer.on('ui:workspaceListViewerRequest', listener)
    return () => {
      ipcRenderer.removeListener('ui:workspaceListViewerRequest', listener)
    }
  },
  respondWorkspaceListViewer: (response: WorkspaceListViewerResponse): void => {
    ipcRenderer.send('ui:workspaceListViewerResponse', response)
  }
}
