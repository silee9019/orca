import { randomUUID } from 'node:crypto'
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { RpcContext } from '../runtime/rpc/core'
import type {
  AppLifecycleControlParams,
  AppLifecycleAction
} from '../../shared/app-lifecycle-control'
import type { z } from 'zod'
import { assertDesktopAppTarget } from '../runtime/rpc/methods/desktop-app-target'
import { isTrustedUIRenderer } from '../ipc/ui'
import { requestDesktopAppRestart } from '../ipc/app'
import { getUpdateStatus, quitAndInstall } from '../updater'

type PendingAppControl = {
  window: BrowserWindow
  action: AppLifecycleAction
  confirmTarget: string
  context: RpcContext
  resolve: (result: {
    state: 'accepted'
    target: string
    action: AppLifecycleAction
    viewer: number
  }) => void
  reject: (error: Error) => void
}
const pending = new Map<string, PendingAppControl>()
const reloadPolicies = new WeakMap<BrowserWindow, () => void>()
export function setAppControlReloadPolicy(window: BrowserWindow, reload: () => void): void {
  reloadPolicies.set(window, reload)
}
let installed = false

function installAppControlHandlers(): void {
  if (installed) {
    return
  }
  installed = true
  ipcMain.on('app-control:failed', (event, requestId: unknown) => {
    if (typeof requestId !== 'string') {
      return
    }
    const request = pending.get(requestId)
    if (request?.window.webContents !== event.sender) {
      return
    }
    pending.delete(requestId)
    request.reject(new Error('Renderer checkpoint failed; app action was not accepted.'))
  })
  ipcMain.handle('app-control:commit', async (event: IpcMainInvokeEvent, requestId: unknown) => {
    if (typeof requestId !== 'string') {
      throw new Error('Invalid app control request')
    }
    const request = pending.get(requestId)
    if (
      !request ||
      request.window.isDestroyed() ||
      request.window.webContents !== event.sender ||
      !isTrustedUIRenderer(event.sender)
    ) {
      throw new Error('App control request expired or belongs to another viewer')
    }
    pending.delete(requestId)
    try {
      assertDesktopAppTarget(request.context, request.confirmTarget)
      switch (request.action) {
        case 'restart':
        case 'relaunch':
          await requestDesktopAppRestart(request.action)
          break
        case 'quit':
          setTimeout(() => app.quit(), 150)
          break
        case 'install-update': {
          const status = getUpdateStatus()
          if (
            status.state !== 'downloaded' &&
            !(status.state === 'error' && status.retryAction === 'install')
          ) {
            throw new Error('No update is ready to install')
          }
          setTimeout(() => quitAndInstall(), 150)
          break
        }
        case 'reload': {
          const reload = reloadPolicies.get(request.window)
          if (!reload) {
            throw new Error('Renderer reload policy is unavailable')
          }
          setTimeout(() => {
            if (!request.window.isDestroyed()) {
              reload()
            }
          }, 150)
          break
        }
      }
      request.resolve({
        state: 'accepted',
        target: request.confirmTarget,
        action: request.action,
        viewer: request.window.id
      })
      return { state: 'accepted' as const }
    } catch (error) {
      request.reject(error instanceof Error ? error : new Error('App action failed'))
      throw error
    }
  })
}

export function listAppControlViewers(): { id: number }[] {
  return BrowserWindow.getAllWindows()
    .filter((window) => !window.isDestroyed() && isTrustedUIRenderer(window.webContents))
    .map((window) => ({ id: window.id }))
}

export async function requestAppControl(
  params: z.infer<typeof AppLifecycleControlParams>,
  context: RpcContext
): Promise<unknown> {
  assertDesktopAppTarget(context, params.confirmTarget)
  const window = BrowserWindow.fromId(params.viewer)
  if (!window || window.isDestroyed() || !isTrustedUIRenderer(window.webContents)) {
    throw new Error('The specified desktop viewer is unavailable')
  }
  for (const request of pending.values()) {
    if (request.window === window) {
      throw new Error('An app action is already pending for this viewer')
    }
  }
  installAppControlHandlers()
  const requestId = randomUUID()
  let timer: ReturnType<typeof setTimeout> | undefined
  const abort = (): void => {
    const request = pending.get(requestId)
    if (request) {
      pending.delete(requestId)
      request.reject(new Error('App action checkpoint timed out or the caller disconnected'))
    }
  }
  if (context.signal?.aborted) {
    throw new Error('App action caller disconnected')
  }
  try {
    return await new Promise((resolve, reject) => {
      pending.set(requestId, {
        window,
        action: params.action,
        context,
        confirmTarget: params.confirmTarget,
        resolve,
        reject
      })
      timer = setTimeout(abort, 25_000)
      context.signal?.addEventListener('abort', abort, { once: true })
      window.webContents.send('app-control:request', { requestId, action: params.action })
    })
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
    pending.delete(requestId)
    context.signal?.removeEventListener('abort', abort)
  }
}
