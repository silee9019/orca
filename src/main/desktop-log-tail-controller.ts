import { randomUUID } from 'node:crypto'
import type { FSWatcher } from 'node:fs'
import { watchLocalLogFile } from './local-log-file-watcher'
type Request = {
  id: string
  state: 'pending' | 'watching' | 'stop_requested' | 'stopped' | 'failed'
  controller: AbortController
  watcher: FSWatcher | null
  closing: boolean
  closed: boolean
  sequence: number
  lastEventType: 'change' | 'rename' | null
  expiresAt: number
  expiry: ReturnType<typeof setTimeout> | null
}
const TTL = 15 * 60 * 1000
export class DesktopLogTailController {
  private request: Request | null = null
  private active = false
  start(authorize: (signal: AbortSignal) => Promise<string>) {
    if (this.active) {
      throw new Error('desktop_log_tail_busy')
    }
    this.dispose()
    const request: Request = {
      id: randomUUID(),
      state: 'pending',
      controller: new AbortController(),
      watcher: null,
      closing: false,
      closed: false,
      sequence: 0,
      lastEventType: null,
      expiresAt: 0,
      expiry: null
    }
    this.request = request
    this.active = true
    void Promise.resolve()
      .then(() => authorize(request.controller.signal))
      .then((filePath) => {
        request.controller.signal.throwIfAborted()
        if (this.request !== request) {
          throw new Error('Selected log tail expired.')
        }
        const watcher = watchLocalLogFile(
          filePath,
          (eventType) => {
            if (this.request === request && request.state === 'watching') {
              request.sequence++
              request.lastEventType = eventType
            }
          },
          () => {
            if (this.request !== request || request.state !== 'watching') {
              return
            }
            request.sequence++
            request.lastEventType = 'rename'
            request.state = 'failed'
            this.close(request)
          }
        )
        request.watcher = watcher
        watcher.once('close', () => {
          request.closed = true
          if (request.state !== 'failed') {
            request.state = 'stopped'
          }
          this.active = false
          this.arm(request)
        })
        request.state = 'watching'
        if (request.controller.signal.aborted) {
          this.close(request)
        }
      })
      .catch(() => {
        request.state = request.controller.signal.aborted ? 'stopped' : 'failed'
        this.active = false
        this.arm(request)
      })
    this.arm(request)
    return this.status(request.id)
  }
  status(id: string) {
    const request = this.get(id)
    return {
      requestId: id,
      state: request.state,
      sequence: request.sequence,
      lastEventType: request.lastEventType,
      watcherClosed: request.closed
    }
  }
  stop(id: string) {
    const request = this.get(id)
    if (this.active && request.state !== 'failed') {
      request.state = 'stop_requested'
    }
    request.controller.abort()
    this.close(request)
    return this.status(id)
  }
  dispose(): void {
    if (!this.request) {
      return
    }
    this.request.controller.abort()
    this.close(this.request)
    if (this.request.expiry) {
      clearTimeout(this.request.expiry)
    }
    this.request = null
  }
  private close(request: Request): void {
    if (request.watcher && !request.closing) {
      request.closing = true
      try {
        request.watcher.close()
      } catch {
        request.closing = false
        request.state = 'failed'
      }
    }
  }
  private get(id: string): Request {
    if (!this.request || this.request.id !== id) {
      throw new Error('selector_not_found')
    }
    if (Date.now() >= this.request.expiresAt) {
      if (this.active) {
        this.request.state = 'stop_requested'
        this.request.controller.abort()
        this.close(this.request)
      } else {
        this.dispose()
        throw new Error('selector_not_found')
      }
    }
    this.arm(this.request)
    return this.request
  }
  private arm(request: Request): void {
    if (this.request !== request) {
      return
    }
    if (request.expiry) {
      clearTimeout(request.expiry)
    }
    request.expiresAt = Date.now() + TTL
    request.expiry = setTimeout(() => {
      if (this.request !== request) {
        return
      }
      if (this.active) {
        request.state = 'stop_requested'
        request.controller.abort()
        this.close(request)
      } else {
        this.dispose()
      }
    }, TTL)
    request.expiry.unref()
  }
}
