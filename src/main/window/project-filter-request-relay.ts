import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import {
  ProjectFilterResultSchema,
  type ProjectFilterResponse,
  type ProjectFilterResult
} from '../../shared/project-filter'
import type { ProjectFilterOperation } from '../../shared/rpc-contract/project-filter-params'

export function requestProjectFilterFromRenderer(
  window: BrowserWindow,
  command: ProjectFilterOperation
): Promise<ProjectFilterResult> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return Promise.reject(new Error('renderer_unavailable'))
  }
  const contents = window.webContents
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const unavailable = (): void => finish(new Error('renderer_unavailable'))
    const finish = (error?: Error, result?: ProjectFilterResult): void => {
      clearTimeout(timer)
      ipcMain.removeListener('ui:projectFilterResponse', response)
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
    const response = (event: Electron.IpcMainEvent, value: ProjectFilterResponse): void => {
      if (event.sender !== contents || value?.id !== id) {
        return
      }
      if (value.ok !== true) {
        finish(
          new Error(typeof value.error === 'string' ? value.error : 'invalid_renderer_response')
        )
        return
      }
      const parsed = ProjectFilterResultSchema.safeParse(value.result)
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
    ipcMain.on('ui:projectFilterResponse', response)
    window.once('closed', unavailable)
    contents.once('destroyed', unavailable)
    contents.once('render-process-gone', unavailable)
    contents.once('did-start-loading', unavailable)
    try {
      contents.send('ui:projectFilterRequest', { id, command, expiresAt: Date.now() + 9000 })
    } catch {
      unavailable()
    }
  })
}
