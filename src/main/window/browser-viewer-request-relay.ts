import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import {
  BrowserViewerResultSchema,
  type BrowserViewerResponse,
  type BrowserViewerResult
} from '../../shared/browser-viewer-command'
import type { BrowserViewerCommand } from '../../shared/rpc-contract/browser-viewer-params'

export function requestBrowserViewerFromRenderer(
  window: BrowserWindow,
  command: BrowserViewerCommand
): Promise<BrowserViewerResult> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return Promise.reject(new Error('renderer_unavailable'))
  }
  const contents = window.webContents
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    let finished = false
    const unavailable = (): void => finish(new Error('renderer_unavailable'))
    const finish = (error?: Error, result?: BrowserViewerResult): void => {
      if (finished) {
        return
      }
      finished = true
      clearTimeout(timer)
      ipcMain.removeListener('ui:browserViewerResponse', response)
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
    const response = (event: Electron.IpcMainEvent, value: BrowserViewerResponse): void => {
      if (event.sender !== contents || value?.id !== id) {
        return
      }
      if (value.ok !== true) {
        finish(
          new Error(typeof value.error === 'string' ? value.error : 'invalid_renderer_response')
        )
        return
      }
      const parsed = BrowserViewerResultSchema.safeParse(value.result)
      if (!parsed.success) {
        finish(new Error('invalid_renderer_response'))
        return
      }
      finish(undefined, parsed.data)
    }
    const timer = setTimeout(() => finish(new Error('renderer_timeout_effect_unknown')), 10_000)
    ipcMain.on('ui:browserViewerResponse', response)
    window.once('closed', unavailable)
    contents.once('destroyed', unavailable)
    contents.once('render-process-gone', unavailable)
    contents.once('did-start-loading', unavailable)
    try {
      contents.send('ui:browserViewerRequest', { id, command, expiresAt: Date.now() + 9000 })
    } catch {
      unavailable()
    }
  })
}
