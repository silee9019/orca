import { ipcRenderer } from 'electron'
import type {
  WorkspaceBoardRequest,
  WorkspaceBoardResponse
} from '../../shared/workspace-board-command'

export const workspaceBoardViewerBridgeApi = {
  onWorkspaceBoardRequest: (callback: (request: WorkspaceBoardRequest) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: WorkspaceBoardRequest): void =>
      callback(request)
    ipcRenderer.on('ui:workspaceBoardViewerRequest', listener)
    return () => {
      ipcRenderer.removeListener('ui:workspaceBoardViewerRequest', listener)
    }
  },
  respondWorkspaceBoard: (response: WorkspaceBoardResponse): void => {
    ipcRenderer.send('ui:workspaceBoardViewerResponse', response)
  }
}
