import { randomUUID } from 'node:crypto'
import type { FsChangeEvent } from '../shared/filesystem-entry-types'
import type { OrcaRuntimeService } from './runtime/orca-runtime'
import { isWatcherProcessFailure } from './ipc/parcel-watcher-process-failure'

type WatchEvent = FsChangeEvent & { sequence: number }
type Request = {
  id: string
  state: 'starting' | 'watching' | 'stop_requested' | 'stopped' | 'failed'
  controller: AbortController
  installation: Promise<void>
  unwatch: (() => Promise<void>) | null
  closing: Promise<void> | null
  installed: boolean
  terminalFailure: boolean
  events: WatchEvent[]
  bytes: number
  sequence: number
  droppedThrough: number
  expiry: ReturnType<typeof setTimeout> | null
}
export class CliFileWatchRequests {
  private readonly requests = new Map<string, Request>()
  start(runtime: Pick<OrcaRuntimeService, 'watchFileExplorer'>, worktree: string) {
    if (this.requests.size >= 8) {
      throw new Error('file_watch_busy')
    }
    const id = randomUUID()
    const request: Request = {
      id,
      state: 'starting',
      controller: new AbortController(),
      installation: Promise.resolve(),
      unwatch: null,
      closing: null,
      installed: false,
      terminalFailure: false,
      events: [],
      bytes: 0,
      sequence: 0,
      droppedThrough: 0,
      expiry: null
    }
    this.requests.set(id, request)
    request.installation = Promise.resolve()
      .then(() =>
        runtime.watchFileExplorer(
          worktree,
          (events) => {
            if (!request.controller.signal.aborted) {
              this.push(request, events)
            }
          },
          () => {
            request.terminalFailure = true
            void this.stop(id).catch(() => {})
          },
          request.controller.signal
        )
      )
      .then((close) => {
        request.unwatch = close
        if (!request.controller.signal.aborted) {
          request.state = 'watching'
        }
      })
      .catch(async (error: unknown) => {
        request.terminalFailure = true
        if (isWatcherProcessFailure(error) && error.physicalExit) {
          await error.physicalExit
        }
        request.state = 'failed'
      })
      .finally(() => {
        request.installed = true
        if (request.controller.signal.aborted && !request.closing) {
          void this.stop(id).catch(() => {})
        }
      })
    this.arm(request)
    return this.status(id)
  }
  status(id: string, afterSequence = 0) {
    const request = this.get(id)
    if (afterSequence > request.sequence) {
      throw new Error('file_watch_cursor_invalid')
    }
    this.arm(request)
    const events = request.events.filter((event) => event.sequence > afterSequence)
    return {
      requestId: id,
      state: request.state,
      sequence: request.sequence,
      overflow:
        afterSequence < request.droppedThrough || events.some((event) => event.kind === 'overflow'),
      cleanupPending: !request.installed || request.unwatch !== null || request.closing !== null,
      events
    }
  }
  async stop(id: string) {
    const request = this.get(id)
    request.controller.abort()
    if (request.state !== 'stopped') {
      request.state = 'stop_requested'
    }
    if (!request.closing) {
      request.closing = (async () => {
        await request.installation
        await request.unwatch?.()
        request.unwatch = null
        request.state = request.terminalFailure ? 'failed' : 'stopped'
      })()
        .catch(() => {
          request.state = 'failed'
          throw new Error('file_watch_cleanup_failed')
        })
        .finally(() => {
          request.closing = null
          this.arm(request)
        })
    }
    await request.closing
    return this.status(id)
  }
  async dispose(): Promise<void> {
    await Promise.all(
      [...this.requests.keys()].map(async (id) => {
        await this.stop(id)
        const request = this.get(id)
        if (request.expiry) {
          clearTimeout(request.expiry)
        }
        this.requests.delete(id)
      })
    )
  }
  private get(id: string): Request {
    const request = this.requests.get(id)
    if (!request) {
      throw new Error('selector_not_found')
    }
    return request
  }
  private push(request: Request, incoming: FsChangeEvent[]): void {
    const skipped = Math.max(0, incoming.length - 128)
    request.sequence += skipped
    if (skipped) {
      request.droppedThrough = request.sequence
    }
    for (const event of incoming.slice(-128)) {
      const next = { ...event, sequence: ++request.sequence }
      const size = Buffer.byteLength(JSON.stringify(next))
      if (size > 64 * 1024) {
        request.droppedThrough = next.sequence
        continue
      }
      request.events.push(next)
      request.bytes += size
      while (request.events.length > 128 || request.bytes > 64 * 1024) {
        const removed = request.events.shift()
        if (removed) {
          request.bytes -= Buffer.byteLength(JSON.stringify(removed))
          request.droppedThrough = Math.max(request.droppedThrough, removed.sequence)
        }
      }
    }
  }
  private arm(request: Request): void {
    if (request.expiry) {
      clearTimeout(request.expiry)
    }
    request.expiry = setTimeout(() => {
      if (request.installed && !request.unwatch && !request.closing) {
        this.requests.delete(request.id)
      } else {
        void this.stop(request.id).catch(() => {})
      }
    }, 60_000)
    request.expiry.unref()
  }
}
