import { randomUUID } from 'node:crypto'
import { ipcMain, type BrowserWindow } from 'electron'
import {
  EmulatorFocusResultSchema,
  type EmulatorFocusResult,
  type EmulatorFocusRequest,
  type EmulatorFocusResponse
} from '../../shared/emulator-focus'

export function requestEmulatorFocus(
  window: BrowserWindow,
  worktreeId: string,
  signal?: AbortSignal,
  frame?: EmulatorFocusRequest['frame']
): Promise<EmulatorFocusResult> {
  if (signal?.aborted) {
    return Promise.reject(new Error('viewer_focus_cancelled_applied_unknown'))
  }
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return Promise.reject(new Error('renderer_unavailable'))
  }
  const contents = window.webContents
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    let settled = false
    const unavailable = (): void => finish(new Error('renderer_unavailable'))
    const cancelled = (): void => finish(new Error('viewer_focus_cancelled_applied_unknown'))
    const finish = (error?: Error, result?: EmulatorFocusResult): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancelled)
      ipcMain.removeListener('emulator:focusResponse', response)
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
    const response = (event: Electron.IpcMainEvent, value: EmulatorFocusResponse): void => {
      if (event.sender !== contents || value?.id !== id) {
        return
      }
      if (value.ok !== true) {
        finish(
          new Error(
            value.error === 'viewer_runtime_mismatch' ? value.error : 'viewer_focus_not_applied'
          )
        )
        return
      }
      const parsed = EmulatorFocusResultSchema.safeParse(value.result)
      if (
        !parsed.success ||
        parsed.data.worktreeId !== worktreeId ||
        (frame &&
          (parsed.data.tabId !== frame.tabId ||
            (frame.action.type !== 'focus-group' &&
              frame.action.type !== 'select-tab' &&
              !parsed.data.frameState) ||
            (frame.action.type === 'focus-group' && parsed.data.groupId !== frame.action.groupId)))
      ) {
        finish(new Error('invalid_renderer_response'))
        return
      }
      finish(undefined, parsed.data)
    }
    const timer = setTimeout(() => finish(new Error('viewer_focus_timeout_applied_unknown')), 10000)
    signal?.addEventListener('abort', cancelled, { once: true })
    ipcMain.on('emulator:focusResponse', response)
    window.once('closed', unavailable)
    contents.once('destroyed', unavailable)
    contents.once('render-process-gone', unavailable)
    contents.once('did-start-loading', unavailable)
    try {
      contents.send(frame ? 'emulator:frameRequest' : 'emulator:focusRequest', {
        id,
        worktreeId,
        expiresAt: Date.now() + 9000,
        ...(frame ? { frame } : {})
      })
    } catch {
      unavailable()
    }
  })
}
