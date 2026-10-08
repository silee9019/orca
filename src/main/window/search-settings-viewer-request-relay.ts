import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import {
  SearchSettingsViewerResultSchema,
  type SearchSettingsViewerResponse,
  type SearchSettingsViewerResult,
  type SearchSettingsViewerCommand
} from '../../shared/search-settings-viewer'

export function requestSearchSettingsViewerFromRenderer(
  window: BrowserWindow,
  command: SearchSettingsViewerCommand
): Promise<SearchSettingsViewerResult> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return Promise.reject(new Error('renderer_unavailable'))
  }
  const contents = window.webContents
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const unavailable = (): void => finish(new Error('renderer_unavailable'))
    const finish = (error?: Error, result?: SearchSettingsViewerResult): void => {
      clearTimeout(timer)
      ipcMain.removeListener('ui:searchSettingsViewerResponse', response)
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
    const response = (event: Electron.IpcMainEvent, value: SearchSettingsViewerResponse): void => {
      if (event.sender !== contents || value?.id !== id) {
        return
      }
      if (value.ok !== true) {
        finish(
          new Error(typeof value.error === 'string' ? value.error : 'invalid_renderer_response')
        )
        return
      }
      const parsed = SearchSettingsViewerResultSchema.safeParse(value.result)
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
    ipcMain.on('ui:searchSettingsViewerResponse', response)
    window.once('closed', unavailable)
    contents.once('destroyed', unavailable)
    contents.once('render-process-gone', unavailable)
    contents.once('did-start-loading', unavailable)
    try {
      contents.send('ui:searchSettingsViewerRequest', { id, command, expiresAt: Date.now() + 9000 })
    } catch {
      unavailable()
    }
  })
}
