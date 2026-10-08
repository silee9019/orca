import { ipcRenderer } from 'electron'
import type { ConnectionsViewerRequest } from '../../shared/connections-viewer'
import type { ConnectionsViewerApi } from './connections-viewer-api'
const api: ConnectionsViewerApi = {
  onRequest: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, request: ConnectionsViewerRequest): void =>
      callback(request)
    ipcRenderer.on('ui:connectionsViewerRequest', listener)
    return () => ipcRenderer.removeListener('ui:connectionsViewerRequest', listener)
  },
  respond: (response) => ipcRenderer.send('ui:connectionsViewerResponse', response)
}
export const connectionsViewerUiApi = {
  onConnectionsViewerRequest: api.onRequest,
  respondConnectionsViewer: api.respond
}
