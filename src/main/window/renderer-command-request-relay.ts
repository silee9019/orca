import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { z } from 'zod'

type ViewerLifecycle = {
  once(event: string, listener: () => void): unknown
  removeListener(event: string, listener: () => void): unknown
  isDestroyed(): boolean
}
export type RendererCommandWindow = ViewerLifecycle & {
  id: number
  webContents: ViewerLifecycle & { send(channel: string, request: unknown): void }
}

export function requestRendererCommand<T extends { viewerId: number }>(
  window: RendererCommandWindow,
  domain: 'workspaceFilter' | 'settingsViewer' | 'sidebarViewer',
  command: unknown,
  resultSchema: z.ZodType<T>,
  timeoutError: 'renderer_timeout_persistence_unknown' | 'renderer_timeout_applied_unknown'
): Promise<T> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return Promise.reject(new Error('renderer_unavailable'))
  }
  const contents = window.webContents
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: Error, result?: T): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      ipcMain.removeListener(`ui:${domain}Response`, response)
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
    const unavailable = (): void => finish(new Error('renderer_unavailable'))
    const response = (event: Electron.IpcMainEvent, value: unknown): void => {
      if (
        event.sender !== contents ||
        typeof value !== 'object' ||
        value === null ||
        !('id' in value) ||
        value.id !== id
      ) {
        return
      }
      if (!('ok' in value) || value.ok !== true) {
        finish(
          new Error(
            'error' in value && typeof value.error === 'string'
              ? value.error
              : 'invalid_renderer_response'
          )
        )
        return
      }
      const parsed = resultSchema.safeParse('result' in value ? value.result : undefined)
      if (!parsed.success) {
        finish(new Error('invalid_renderer_response'))
        return
      }
      finish(undefined, parsed.data)
    }
    const timer = setTimeout(() => finish(new Error(timeoutError)), 10000)
    timer.unref?.()
    ipcMain.on(`ui:${domain}Response`, response)
    window.once('closed', unavailable)
    contents.once('destroyed', unavailable)
    contents.once('render-process-gone', unavailable)
    contents.once('did-start-loading', unavailable)
    try {
      contents.send(`ui:${domain}Request`, {
        id,
        command,
        expiresAt: Date.now() + 9000
      })
    } catch {
      unavailable()
    }
  })
}
