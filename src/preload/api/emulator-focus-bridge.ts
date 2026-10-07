import { ipcRenderer } from 'electron'
import type {
  EmulatorFocusApi,
  EmulatorFocusRequest,
  EmulatorFocusResponse
} from '../../shared/emulator-focus'
export const emulatorFocusApi: EmulatorFocusApi = {
  onFrameRequest: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, request: EmulatorFocusRequest): void =>
      callback(request)
    ipcRenderer.on('emulator:frameRequest', listener)
    return () => ipcRenderer.removeListener('emulator:frameRequest', listener)
  },
  onFocusRequest: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, request: EmulatorFocusRequest): void =>
      callback(request)
    ipcRenderer.on('emulator:focusRequest', listener)
    return () => ipcRenderer.removeListener('emulator:focusRequest', listener)
  },
  respondFocus: (response: EmulatorFocusResponse) =>
    ipcRenderer.send('emulator:focusResponse', response)
}
