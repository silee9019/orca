import { ipcRenderer } from 'electron'
import {
  ACCOUNT_VIEWER_REQUEST_CHANNEL,
  ACCOUNT_VIEWER_RESPONSE_CHANNEL,
  AccountViewerRequestSchema,
  AccountViewerResponseSchema,
  type AccountViewerApi
} from '../../shared/account-viewer-contract'

export const accountViewerApi: AccountViewerApi = {
  onRequest: (callback) => {
    const listener = (_event: unknown, payload: unknown): void => {
      const parsed = AccountViewerRequestSchema.safeParse(payload)
      if (parsed.success) {
        callback(parsed.data)
      }
    }
    ipcRenderer.on(ACCOUNT_VIEWER_REQUEST_CHANNEL, listener)
    return () => ipcRenderer.removeListener(ACCOUNT_VIEWER_REQUEST_CHANNEL, listener)
  },
  acknowledge: (response) =>
    ipcRenderer.send(ACCOUNT_VIEWER_RESPONSE_CHANNEL, AccountViewerResponseSchema.parse(response))
}
