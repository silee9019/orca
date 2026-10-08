import { randomUUID } from 'node:crypto'
import { BrowserWindow, ipcMain } from 'electron'
import type { z } from 'zod'
import { AppSurfaceReply, type AppSurfaceControlParams } from '../../shared/app-surface-control'
import { isTrustedUIRenderer } from '../ipc/ui'
import { assertDesktopAppTarget } from '../runtime/rpc/methods/desktop-app-target'
import type { RpcContext } from '../runtime/rpc/core'

const pending = new Map<
  string,
  { window: BrowserWindow; resolve: (reply: unknown) => void; reject: (error: Error) => void }
>()
let installed = false
export async function requestAppSurfaceControl(
  params: z.infer<typeof AppSurfaceControlParams>,
  context: RpcContext
): Promise<unknown> {
  assertDesktopAppTarget(context, params.confirmTarget)
  const window = BrowserWindow.fromId(params.viewer)
  if (!window || window.isDestroyed() || !isTrustedUIRenderer(window.webContents)) {
    throw new Error('The specified desktop viewer is unavailable')
  }
  if (context.signal?.aborted) {
    throw new Error('Caller disconnected')
  }
  if ([...pending.values()].some((entry) => entry.window === window)) {
    throw new Error('A surface action is already pending for this viewer')
  }
  if (!installed) {
    installed = true
    ipcMain.on('app-surface:reply', (event, input: unknown) => {
      const reply = AppSurfaceReply.safeParse(input)
      if (!reply.success) {
        return
      }
      const request = pending.get(reply.data.requestId)
      if (
        !request ||
        request.window.isDestroyed() ||
        request.window.webContents !== event.sender ||
        !isTrustedUIRenderer(event.sender)
      ) {
        return
      }
      pending.delete(reply.data.requestId)
      if (reply.data.ok) {
        request.resolve({
          state: 'acknowledged',
          viewer: request.window.id,
          result: reply.data.result,
          rendered: false
        })
      } else {
        request.reject(new Error(reply.data.error || 'Surface action failed'))
      }
    })
  }
  const requestId = randomUUID()
  let timer: ReturnType<typeof setTimeout> | undefined
  const abort = (): void => {
    const entry = pending.get(requestId)
    pending.delete(requestId)
    entry?.reject(
      new Error('Surface action timed out or caller disconnected; inspect state before retrying')
    )
  }
  try {
    return await new Promise((resolve, reject) => {
      pending.set(requestId, { window, resolve, reject })
      timer = setTimeout(abort, 25_000)
      context.signal?.addEventListener('abort', abort, { once: true })
      window.webContents.send('app-surface:request', { requestId, action: params.action })
    })
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
    context.signal?.removeEventListener('abort', abort)
    pending.delete(requestId)
  }
}
