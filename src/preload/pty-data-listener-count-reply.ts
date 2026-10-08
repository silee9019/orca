import {
  PTY_DATA_LISTENER_COUNT_REQUEST,
  PTY_DATA_LISTENER_COUNT_REPLY,
  PtyDataListenerCountRequest
} from '../shared/pty-data-listener-count'
type CountIpc = {
  on: (channel: string, listener: (event: unknown, payload: unknown) => void) => unknown
  removeListener: (channel: string, listener: (event: unknown, payload: unknown) => void) => unknown
  send: (channel: string, payload: unknown) => void
}
export function installPtyDataListenerCountReply(
  ipc: CountIpc,
  readCount: () => number
): () => void {
  const listener = (_event: unknown, payload: unknown) => {
    const parsed = PtyDataListenerCountRequest.safeParse(payload)
    if (!parsed.success) {
      return
    }
    const count = readCount()
    if (!Number.isSafeInteger(count) || count < 0) {
      return
    }
    ipc.send(PTY_DATA_LISTENER_COUNT_REPLY, { requestId: parsed.data.requestId, count })
  }
  ipc.on(PTY_DATA_LISTENER_COUNT_REQUEST, listener)
  return () => {
    ipc.removeListener(PTY_DATA_LISTENER_COUNT_REQUEST, listener)
  }
}
