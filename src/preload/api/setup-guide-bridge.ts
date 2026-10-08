import { ipcRenderer } from 'electron'
import type { SetupGuideRequest, SetupGuideResponse } from '../../shared/setup-guide-command'
export const setupGuideBridgeApi = {
  onSetupGuideRequest: (callback: (request: SetupGuideRequest) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: SetupGuideRequest): void =>
      callback(request)
    ipcRenderer.on('ui:setupGuideViewerRequest', listener)
    return () => {
      ipcRenderer.removeListener('ui:setupGuideViewerRequest', listener)
    }
  },
  respondSetupGuide: (response: SetupGuideResponse): void => {
    ipcRenderer.send('ui:setupGuideViewerResponse', response)
  }
}
