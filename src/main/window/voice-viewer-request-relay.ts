import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import {
  VoiceViewerResultSchema,
  type VoiceViewerResponse,
  type VoiceViewerResult,
  type VoiceViewerOperation
} from '../../shared/voice-viewer'

export function requestVoiceViewerFromRenderer(
  window: BrowserWindow,
  command: VoiceViewerOperation
): Promise<VoiceViewerResult> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return Promise.reject(new Error('renderer_unavailable'))
  }
  const contents = window.webContents
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const unavailable = (): void => finish(new Error('renderer_unavailable'))
    const finish = (error?: Error, result?: VoiceViewerResult): void => {
      clearTimeout(timer)
      ipcMain.removeListener('ui:voiceViewerResponse', response)
      window.removeListener('closed', unavailable)
      contents.removeListener('destroyed', unavailable)
      contents.removeListener('render-process-gone', unavailable)
      contents.removeListener('did-start-loading', unavailable)
      if (error) {
        reject(error)
      } else if (result) {
        resolve({ ...result, viewerId: window.id })
      }
    }
    const response = (event: Electron.IpcMainEvent, value: VoiceViewerResponse): void => {
      if (event.sender !== contents || value?.id !== id) {
        return
      }
      if (value.ok !== true) {
        finish(
          new Error(typeof value.error === 'string' ? value.error : 'invalid_renderer_response')
        )
        return
      }
      const parsed = VoiceViewerResultSchema.safeParse(value.result)
      if (!parsed.success) {
        finish(new Error('invalid_renderer_response'))
        return
      }
      finish(undefined, parsed.data)
    }
    const timer = setTimeout(
      () => finish(new Error('renderer_timeout_persistence_unknown')),
      10_000
    )
    ipcMain.on('ui:voiceViewerResponse', response)
    window.once('closed', unavailable)
    contents.once('destroyed', unavailable)
    contents.once('render-process-gone', unavailable)
    contents.once('did-start-loading', unavailable)
    try {
      contents.send('ui:voiceViewerRequest', { id, command, expiresAt: Date.now() + 9000 })
    } catch {
      unavailable()
    }
  })
}
