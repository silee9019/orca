import { ipcRenderer } from 'electron'
import type { CrashReportRequest, CrashReportResponse } from '../../shared/crash-report-command'
export const crashReportBridgeApi = {
  onCrashReportRequest: (callback: (request: CrashReportRequest) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: CrashReportRequest): void =>
      callback(request)
    ipcRenderer.on('ui:crashReportViewerRequest', listener)
    return () => {
      ipcRenderer.removeListener('ui:crashReportViewerRequest', listener)
    }
  },
  respondCrashReport: (response: CrashReportResponse): void => {
    ipcRenderer.send('ui:crashReportViewerResponse', response)
  }
}
