import { ipcRenderer } from 'electron'
import type {
  WorkspaceFilterRequest,
  WorkspaceFilterResponse
} from '../../shared/workspace-filter-command'

export const workspaceFilterBridgeApi = {
  onWorkspaceFilterRequest(callback: (request: WorkspaceFilterRequest) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, request: WorkspaceFilterRequest): void =>
      callback(request)
    ipcRenderer.on('ui:workspaceFilterRequest', listener)
    return () => ipcRenderer.removeListener('ui:workspaceFilterRequest', listener)
  },
  respondWorkspaceFilter(response: WorkspaceFilterResponse): void {
    ipcRenderer.send('ui:workspaceFilterResponse', response)
  }
}
