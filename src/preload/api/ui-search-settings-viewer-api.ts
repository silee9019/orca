import { ipcRenderer } from 'electron'
import type {
  SearchSettingsViewerRequest,
  SearchSettingsViewerResponse
} from '../../shared/search-settings-viewer'

export const uiSearchSettingsViewerApi = {
  onSearchSettingsViewerRequest: (
    callback: (request: SearchSettingsViewerRequest) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      request: SearchSettingsViewerRequest
    ): void => callback(request)
    ipcRenderer.on('ui:searchSettingsViewerRequest', listener)
    return () => ipcRenderer.removeListener('ui:searchSettingsViewerRequest', listener)
  },
  respondSearchSettingsViewer: (response: SearchSettingsViewerResponse): void => {
    ipcRenderer.send('ui:searchSettingsViewerResponse', response)
  }
}
