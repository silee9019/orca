import { ipcRenderer } from 'electron'
import type { CardViewerRequest, CardViewerResponse } from '../../shared/card-viewer-command'

export const cardViewerBridgeApi = {
  onCardViewerRequest: (callback: (request: CardViewerRequest) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: CardViewerRequest): void =>
      callback(request)
    ipcRenderer.on('ui:cardViewerRequest', listener)
    return () => {
      ipcRenderer.removeListener('ui:cardViewerRequest', listener)
    }
  },
  respondCardViewer: (response: CardViewerResponse): void => {
    ipcRenderer.send('ui:cardViewerResponse', response)
  }
}
