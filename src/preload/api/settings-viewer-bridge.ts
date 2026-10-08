import { ipcRenderer } from 'electron'
import type {
  SettingsViewerRequest,
  SettingsViewerResponse
} from '../../shared/settings-viewer-command'

export const settingsViewerBridgeApi = {
  onSettingsViewerRequest: (callback: (request: SettingsViewerRequest) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: SettingsViewerRequest): void =>
      callback(request)
    ipcRenderer.on('ui:settingsViewerRequest', listener)
    return () => {
      ipcRenderer.removeListener('ui:settingsViewerRequest', listener)
    }
  },
  respondSettingsViewer: (response: SettingsViewerResponse): void => {
    ipcRenderer.send('ui:settingsViewerResponse', response)
  }
}
