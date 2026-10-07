import { randomUUID } from 'node:crypto'
import { ipcMain, type IpcMainEvent } from 'electron'
import { getTrustedUIRendererWebContents } from '../ipc/ui'
import { InvalidArgumentError } from './rpc/core'
import {
  ACCOUNT_VIEWER_REQUEST_CHANNEL,
  ACCOUNT_VIEWER_RESPONSE_CHANNEL,
  AccountViewerCommandSchema,
  AccountViewerResponseSchema,
  type AccountViewerCommand
} from '../../shared/account-viewer-contract'

export async function requestAccountViewerAction(
  command: AccountViewerCommand,
  signal?: AbortSignal
): Promise<unknown> {
  const parsedCommand = AccountViewerCommandSchema.parse(command)
  const renderer = getTrustedUIRendererWebContents()
  if (!renderer) {
    throw new InvalidArgumentError('desktop_unavailable')
  }
  if (signal?.aborted) {
    throw new InvalidArgumentError('request_cancelled')
  }
  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    const finish = (result?: unknown, error?: Error): void => {
      clearTimeout(timeout)
      ipcMain.removeListener(ACCOUNT_VIEWER_RESPONSE_CHANNEL, onResponse)
      signal?.removeEventListener('abort', onAbort)
      if (error) {
        reject(error)
      } else {
        resolve(result)
      }
    }
    const onResponse = (event: IpcMainEvent, payload: unknown): void => {
      if (event.sender !== renderer) {
        return
      }
      const parsed = AccountViewerResponseSchema.safeParse(payload)
      if (!parsed.success || parsed.data.requestId !== requestId) {
        return
      }
      if (parsed.data.ok) {
        finish(parsed.data.result)
      } else {
        finish(undefined, new InvalidArgumentError(parsed.data.error))
      }
    }
    const onAbort = (): void =>
      finish(
        undefined,
        new InvalidArgumentError('request_cancelled: inspect state before retrying')
      )
    const timeout = setTimeout(
      () =>
        finish(
          undefined,
          new InvalidArgumentError('desktop_ack_timeout: inspect state before retrying')
        ),
      5000
    )
    ipcMain.on(ACCOUNT_VIEWER_RESPONSE_CHANNEL, onResponse)
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      renderer.send(ACCOUNT_VIEWER_REQUEST_CHANNEL, {
        requestId,
        viewer: 'desktop',
        command: parsedCommand
      })
    } catch {
      finish(undefined, new InvalidArgumentError('desktop_unavailable'))
    }
  })
}
