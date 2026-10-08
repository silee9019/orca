import { randomUUID } from 'node:crypto'
import {
  PTY_DATA_LISTENER_COUNT_REQUEST,
  PTY_DATA_LISTENER_COUNT_REPLY,
  PtyDataListenerCountReply
} from '../../shared/pty-data-listener-count'
type ReplyEvent = { sender: unknown; senderFrame: unknown }
type Listener = (event: ReplyEvent, payload: unknown) => void
type Renderer = {
  id: number
  mainFrame: unknown
  isDestroyed: () => boolean
  send: (channel: string, payload: unknown) => void
  on(channel: 'did-start-navigation', listener: () => void): unknown
  on(channel: 'render-process-gone', listener: () => void): unknown
  on(channel: 'destroyed', listener: () => void): unknown
  removeListener(channel: 'did-start-navigation', listener: () => void): unknown
  removeListener(channel: 'render-process-gone', listener: () => void): unknown
  removeListener(channel: 'destroyed', listener: () => void): unknown
}
export function requestPtyDataListenerCount(
  window: { isDestroyed: () => boolean; webContents: Renderer },
  ipc: {
    on: (channel: string, listener: Listener) => unknown
    removeListener: (channel: string, listener: Listener) => unknown
  },
  rendererId: number,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<number> {
  return new Promise((resolve, reject) => {
    const contents = window.webContents,
      frame = contents.mainFrame,
      requestId = randomUUID()
    const matches = () =>
      !window.isDestroyed() &&
      !contents.isDestroyed() &&
      contents.id === rendererId &&
      contents.mainFrame === frame &&
      !signal?.aborted
    if (!matches()) {
      reject(new Error('renderer_listener_count_owner_unavailable'))
      return
    }
    const cleanup = () => {
      clearTimeout(timer)
      ipc.removeListener(PTY_DATA_LISTENER_COUNT_REPLY, reply)
      contents.removeListener('did-start-navigation', changed)
      contents.removeListener('render-process-gone', changed)
      contents.removeListener('destroyed', changed)
      signal?.removeEventListener('abort', changed)
    }
    const changed = () => {
      cleanup()
      reject(new Error('renderer_listener_count_owner_changed_or_cancelled'))
    }
    const reply: Listener = (event, payload) => {
      if (event.sender !== contents || event.senderFrame !== frame) {
        return
      }
      const parsed = PtyDataListenerCountReply.safeParse(payload)
      if (!parsed.success || parsed.data.requestId !== requestId) {
        return
      }
      if (!matches()) {
        changed()
        return
      }
      cleanup()
      resolve(parsed.data.count)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('renderer_listener_count_timeout'))
    }, timeoutMs)
    ipc.on(PTY_DATA_LISTENER_COUNT_REPLY, reply)
    contents.on('did-start-navigation', changed)
    contents.on('render-process-gone', changed)
    contents.on('destroyed', changed)
    signal?.addEventListener('abort', changed, { once: true })
    try {
      contents.send(PTY_DATA_LISTENER_COUNT_REQUEST, { requestId })
    } catch {
      changed()
    }
  })
}
