import { ipcRenderer } from 'electron'
import type { VoiceViewerRequest, VoiceViewerResponse } from '../../shared/voice-viewer'

export const uiVoiceViewerApi = {
  onVoiceViewerRequest: (callback: (request: VoiceViewerRequest) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: VoiceViewerRequest): void =>
      callback(request)
    ipcRenderer.on('ui:voiceViewerRequest', listener)
    return () => ipcRenderer.removeListener('ui:voiceViewerRequest', listener)
  },
  respondVoiceViewer: (response: VoiceViewerResponse): void => {
    ipcRenderer.send('ui:voiceViewerResponse', response)
  }
}
