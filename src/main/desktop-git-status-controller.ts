import { randomUUID } from 'node:crypto'
import type { GitStatusResult } from '../shared/git-status-types'
type Request = {
  id: string
  state: 'pending' | 'completed' | 'cancel_requested' | 'cancelled' | 'failed'
  controller: AbortController
  result: GitStatusResult | null
  truncated: boolean
  settledAt: number | null
  timer: ReturnType<typeof setTimeout> | null
}
const TTL = 15 * 60 * 1000
const MAX_BYTES = 1024 * 1024
export class DesktopGitStatusController {
  private request: Request | null = null
  private active = false
  start(read: (signal: AbortSignal) => Promise<GitStatusResult>) {
    if (this.active) {
      throw new Error('desktop_git_status_busy')
    }
    this.dispose()
    const request: Request = {
      id: randomUUID(),
      state: 'pending',
      controller: new AbortController(),
      result: null,
      truncated: false,
      settledAt: null,
      timer: null
    }
    this.request = request
    this.active = true
    request.timer = setTimeout(() => {
      request.state = 'cancel_requested'
      request.controller.abort()
    }, 120000)
    request.timer.unref()
    void Promise.resolve()
      .then(() => read(request.controller.signal))
      .then((result) => {
        request.controller.signal.throwIfAborted()
        const { entries, ignoredPaths, ...metadata } = result
        if (Buffer.byteLength(JSON.stringify(metadata)) > 65536) {
          throw new Error('Git status metadata exceeds limit.')
        }
        const bounded: GitStatusResult = {
          ...structuredClone(metadata),
          entries: [],
          ...(ignoredPaths ? { ignoredPaths: [] } : {})
        }
        let bytes = Buffer.byteLength(JSON.stringify(bounded))
        for (const entry of entries) {
          const size = Buffer.byteLength(JSON.stringify(entry)) + 1
          if (bounded.entries.length >= 2000 || bytes + size > MAX_BYTES) {
            request.truncated = true
            break
          }
          bytes += size
          bounded.entries.push(structuredClone(entry))
        }
        for (const path of ignoredPaths ?? []) {
          const size = Buffer.byteLength(JSON.stringify(path)) + 1
          if ((bounded.ignoredPaths?.length ?? 0) >= 2000 || bytes + size > MAX_BYTES) {
            request.truncated = true
            break
          }
          bytes += size
          bounded.ignoredPaths?.push(path)
        }
        request.result = bounded
        request.state = 'completed'
      })
      .catch(() => {
        request.state = 'failed'
        request.result = null
      })
      .finally(() => {
        if (request.controller.signal.aborted) {
          request.state = 'cancelled'
          request.result = null
        }
        this.active = false
        request.settledAt = Date.now()
        if (request.timer) {
          clearTimeout(request.timer)
        }
        if (this.request !== request) {
          return
        }
        request.timer = setTimeout(() => {
          if (this.request === request) {
            this.dispose()
          }
        }, TTL)
        request.timer.unref()
      })
    return this.status(request.id)
  }
  status(id: string) {
    const r = this.get(id)
    return { requestId: id, state: r.state, executionVerdict: 'unverifiable' as const }
  }
  cancel(id: string) {
    const r = this.get(id)
    r.controller.abort()
    r.result = null
    r.state = this.active ? 'cancel_requested' : 'cancelled'
    return this.status(id)
  }
  result(id: string, offset: number, limit: number) {
    const r = this.get(id)
    if (r.state !== 'completed' || !r.result) {
      throw new Error('No completed CLI Git status result.')
    }
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 500
    ) {
      throw new Error('Invalid Git status page.')
    }
    const { entries, ignoredPaths, ...metadata } = r.result
    return {
      requestId: id,
      offset,
      limit,
      totalEntries: entries.length,
      totalIgnoredPaths: ignoredPaths?.length ?? 0,
      status: structuredClone({
        ...metadata,
        entries: entries.slice(offset, offset + limit),
        ...(ignoredPaths ? { ignoredPaths: ignoredPaths.slice(offset, offset + limit) } : {})
      }),
      hasMore: offset + limit < Math.max(entries.length, ignoredPaths?.length ?? 0),
      truncated: r.truncated
    }
  }
  dispose(): void {
    if (this.request) {
      this.request.controller.abort()
      if (this.request.timer) {
        clearTimeout(this.request.timer)
      }
      this.request.result = null
      this.request = null
    }
  }
  private get(id: string): Request {
    if (
      this.request?.settledAt !== null &&
      this.request &&
      Date.now() - this.request.settledAt >= TTL
    ) {
      this.dispose()
    }
    if (!this.request || this.request.id !== id) {
      throw new Error('selector_not_found')
    }
    return this.request
  }
}
