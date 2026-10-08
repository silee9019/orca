import { contextBridge, ipcRenderer } from 'electron'
import {
  AppSurfaceRequest,
  AppSurfaceReply,
  type AppSurfaceApi
} from '../shared/app-surface-control'

export function installAppSurfaceControl(): void {
  const api: AppSurfaceApi = {
    onRequest(callback) {
      const listener = (_event: unknown, input: unknown): void => {
        const request = AppSurfaceRequest.safeParse(input)
        if (request.success) {
          callback(request.data)
        }
      }
      ipcRenderer.on('app-surface:request', listener)
      return () => ipcRenderer.removeListener('app-surface:request', listener)
    },
    reply(input) {
      ipcRenderer.send('app-surface:reply', AppSurfaceReply.parse(input))
    }
  }
  contextBridge.exposeInMainWorld('orcaAppSurface', api)
}
